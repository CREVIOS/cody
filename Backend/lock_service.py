import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from fastapi import HTTPException, status
from sqlalchemy import select, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from models import WebSocketConnection

LOCK_TIMEOUT = timedelta(minutes=2)

log = logging.getLogger("app.locks.service")

# -------------------- helpers --------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _as_state_dict_row(row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not row or row.get("state") == "UNLOCKED" or not row.get("holder_user_id"):
        return {"state": "UNLOCKED"}
    return {
        "state": "LOCKED",
        "holder_user_id": str(row["holder_user_id"]),
        "expires_at": row["expires_at"].isoformat() if row.get("expires_at") else None,
    }

async def _fetch_lock_row(db: AsyncSession, file_id: uuid.UUID) -> Optional[Dict[str, Any]]:
    sql = text("""
        SELECT file_id, holder_user_id, state, expires_at
        FROM file_locks
        WHERE file_id = :file_id
        LIMIT 1
    """)
    res = await db.execute(sql, {"file_id": str(file_id)})
    row = res.mappings().first()
    return dict(row) if row else None

async def _upsert_lock(db: AsyncSession, file_id: uuid.UUID, holder_user_id: uuid.UUID,
                       state: str, expires_at: Optional[datetime]) -> None:
    sql = text("""
        INSERT INTO file_locks (file_id, holder_user_id, state, expires_at)
        VALUES (:file_id, :holder_user_id, :state, :expires_at)
        ON CONFLICT (file_id) DO UPDATE SET
            holder_user_id = EXCLUDED.holder_user_id,
            state          = EXCLUDED.state,
            expires_at     = EXCLUDED.expires_at
    """)
    await db.execute(sql, {
        "file_id": str(file_id),
        "holder_user_id": str(holder_user_id) if holder_user_id else None,
        "state": state,
        "expires_at": expires_at,
    })

async def _unlock(db: AsyncSession, file_id: uuid.UUID) -> None:
    sql = text("""
        UPDATE file_locks
        SET state = 'UNLOCKED', holder_user_id = NULL, expires_at = NULL
        WHERE file_id = :file_id
    """)
    await db.execute(sql, {"file_id": str(file_id)})

async def _cleanup_expired(db: AsyncSession):
    sql = text("""
        UPDATE file_locks
        SET state = 'UNLOCKED', holder_user_id = NULL, expires_at = NULL
        WHERE expires_at IS NOT NULL AND expires_at < :now
    """)
    await db.execute(sql, {"now": _now()})
    await db.commit()

async def _active_user_ids_on_file(db: AsyncSession, file_id: uuid.UUID) -> set[uuid.UUID]:
    """
    Distinct users whose websocket connection is active for this file.
    """
    q = (
        select(WebSocketConnection.user_id)
        .where(
            and_(
                WebSocketConnection.is_active == True,
                WebSocketConnection.connection_type == "editor",
                WebSocketConnection.client_info["file_id"].astext == str(file_id),
            )
        )
        .distinct()
    )
    r = await db.execute(q)
    return set(r.scalars().all())

# -------------------- public API --------------------

async def get_state(db: AsyncSession, file_id: uuid.UUID) -> Dict[str, Any]:
    await _cleanup_expired(db)
    row = await _fetch_lock_row(db, file_id)
    return _as_state_dict_row(row)

async def request_lock(db: AsyncSession, file_id: uuid.UUID, user_id: uuid.UUID, role: str) -> Dict[str, Any]:
    """
    Simple rule: 
    - Owner/admin/maintainer → ALWAYS grant (no checks)
    - Everyone else: If only 1 person connected, they can edit. If 2+, first person locks, others blocked.
    """
    await _cleanup_expired(db)
    now = _now()

    role_norm = (role or "").strip().lower()
    OWNER_ROLES = {"owner", "admin", "administrator", "maintainer"}
    is_owner = role_norm in OWNER_ROLES

    log.info("📥 request_lock file=%s user=%s role=%s is_owner=%s", file_id, user_id, role_norm, is_owner)

    # OWNER: Always grant immediately, no questions asked
    if is_owner:
        log.info("👑 OWNER - granting lock immediately")
        await _upsert_lock(db, file_id, user_id, "LOCKED", now + LOCK_TIMEOUT)
        await db.commit()
        return _as_state_dict_row(await _fetch_lock_row(db, file_id))

    # Non-owner: Check active websocket connections
    active_users = await _active_user_ids_on_file(db, file_id)
    log.info("👥 active_users=%s (count=%d)", [str(u) for u in active_users], len(active_users))

    # If only 1 person (me), grant immediately
    if len(active_users) <= 1:
        log.info("🚶 Single user - granting lock")
        await _upsert_lock(db, file_id, user_id, "LOCKED", now + LOCK_TIMEOUT)
        await db.commit()
        return _as_state_dict_row(await _fetch_lock_row(db, file_id))

    # Multiple users - check lock state
    row = await _fetch_lock_row(db, file_id)
    
    # If unlocked, grant to first requester
    if not row or row.get("state") == "UNLOCKED":
        log.info("🔓 Multi-user, unlocked - granting to first requester")
        await _upsert_lock(db, file_id, user_id, "LOCKED", now + LOCK_TIMEOUT)
        await db.commit()
        return _as_state_dict_row(await _fetch_lock_row(db, file_id))
    
    # If I already hold it, renew
    if str(row.get("holder_user_id")) == str(user_id):
        log.info("🔄 Already holds lock - renewing")
        await _upsert_lock(db, file_id, user_id, "LOCKED", now + LOCK_TIMEOUT)
        await db.commit()
        return _as_state_dict_row(await _fetch_lock_row(db, file_id))
    
    # Someone else holds it - blocked
    log.info("🚫 Blocked: another user holds the lock")
    raise HTTPException(
        status_code=status.HTTP_423_LOCKED,
        detail="File is being edited by another user. Please wait."
    )

async def release_lock(db: AsyncSession, file_id: uuid.UUID, user_id: uuid.UUID) -> Dict[str, Any]:
    await _cleanup_expired(db)
    row = await _fetch_lock_row(db, file_id)
    
    if not row or row.get("state") == "UNLOCKED":
        return _as_state_dict_row(row)

    if str(row.get("holder_user_id")) != str(user_id):
        raise HTTPException(status_code=403, detail="You do not hold this lock.")

    log.info("🔓 Releasing lock for user %s", user_id)
    await _unlock(db, file_id)
    await db.commit()
    
    return {"state": "UNLOCKED"}

async def heartbeat(db: AsyncSession, file_id: uuid.UUID, user_id: uuid.UUID) -> Dict[str, Any]:
    await _cleanup_expired(db)
    row = await _fetch_lock_row(db, file_id)
    
    if not row or row.get("state") == "UNLOCKED":
        raise HTTPException(status_code=404, detail="No active lock.")
    
    if str(row.get("holder_user_id")) != str(user_id):
        raise HTTPException(status_code=403, detail="You are not the lock holder.")
    
    log.info("💓 Heartbeat from user %s", user_id)
    await _upsert_lock(db, file_id, user_id, "LOCKED", _now() + LOCK_TIMEOUT)
    await db.commit()
    
    return _as_state_dict_row(await _fetch_lock_row(db, file_id))