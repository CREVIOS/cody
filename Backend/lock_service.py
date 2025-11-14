import uuid
import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from fastapi import HTTPException, status
from sqlalchemy import select, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from models import WebSocketConnection
from db import AsyncSessionLocal

LOCK_TIMEOUT = timedelta(minutes=2)
CLEANUP_INTERVAL = timedelta(seconds=30)  # Run cleanup every 30 seconds

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

async def _fetch_lock_row(db: AsyncSession, file_id: uuid.UUID, for_update: bool = False) -> Optional[Dict[str, Any]]:
    """
    Fetch lock row, optionally with FOR UPDATE to acquire exclusive row-level lock.
    This prevents race conditions during concurrent lock operations.
    """
    lock_clause = "FOR UPDATE" if for_update else ""
    sql = text(f"""
        SELECT file_id, holder_user_id, state, expires_at
        FROM file_locks
        WHERE file_id = :file_id
        LIMIT 1
        {lock_clause}
    """)
    res = await db.execute(sql, {"file_id": str(file_id)})
    row = res.mappings().first()
    return dict(row) if row else None

async def _upsert_lock(db: AsyncSession, file_id: uuid.UUID, holder_user_id: uuid.UUID,
                       state: str, expires_at: Optional[datetime], expected_holder: Optional[uuid.UUID] = None) -> bool:
    """
    Upsert lock with optional check-and-set semantics.
    If expected_holder is provided, only updates if current holder matches or lock is unlocked.
    Returns True if update succeeded, False if check failed.
    """
    if expected_holder is not None:
        # Use check-and-set UPDATE for atomic compare-and-swap
        sql = text("""
            UPDATE file_locks
            SET holder_user_id = :holder_user_id,
                state = :state,
                expires_at = :expires_at
            WHERE file_id = :file_id
              AND (holder_user_id = :expected_holder OR holder_user_id IS NULL OR state = 'UNLOCKED')
        """)
        result = await db.execute(sql, {
            "file_id": str(file_id),
            "holder_user_id": str(holder_user_id) if holder_user_id else None,
            "state": state,
            "expires_at": expires_at,
            "expected_holder": str(expected_holder) if expected_holder else None,
        })
        return result.rowcount > 0
    else:
        # Standard upsert without check
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
        return True

async def _unlock(db: AsyncSession, file_id: uuid.UUID) -> None:
    sql = text("""
        UPDATE file_locks
        SET state = 'UNLOCKED', holder_user_id = NULL, expires_at = NULL
        WHERE file_id = :file_id
    """)
    await db.execute(sql, {"file_id": str(file_id)})

async def _cleanup_expired(db: AsyncSession):
    """
    Clean up expired locks by setting them to UNLOCKED.
    Returns the number of locks cleaned up.
    """
    sql = text("""
        UPDATE file_locks
        SET state = 'UNLOCKED', holder_user_id = NULL, expires_at = NULL
        WHERE expires_at IS NOT NULL AND expires_at < :now
    """)
    result = await db.execute(sql, {"now": _now()})
    await db.commit()
    return result.rowcount

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
    Atomically request a file lock with proper race condition prevention.

    Rules:
    - Owner/admin → ALWAYS grant (preempts current holder)
    - Everyone else: If only 1 person connected, they can edit. If 2+, first person locks, others blocked.

    Uses SELECT FOR UPDATE to prevent race conditions.
    """
    # Cleanup expired locks first (separate transaction)
    await _cleanup_expired(db)

    now = _now()
    role_norm = (role or "").strip().lower()
    OWNER_ROLES = {"owner", "admin", "administrator"}
    is_owner = role_norm in OWNER_ROLES

    log.info("📥 request_lock file=%s user=%s role=%s is_owner=%s", file_id, user_id, role_norm, is_owner)

    # Start a new transaction for atomic lock operation
    async with db.begin_nested():
        # OWNER: Always grant immediately with preemption
        if is_owner:
            log.info("👑 OWNER - granting lock immediately (may preempt current holder)")
            await _upsert_lock(db, file_id, user_id, "LOCKED", now + LOCK_TIMEOUT)
            await db.flush()  # Ensure changes are visible in this transaction
            result = await _fetch_lock_row(db, file_id)
            await db.commit()
            return _as_state_dict_row(result)

        # Non-owner: Check active websocket connections
        active_users = await _active_user_ids_on_file(db, file_id)
        log.info("👥 active_users=%s (count=%d)", [str(u) for u in active_users], len(active_users))

        # Acquire exclusive lock on the file_locks row to prevent race conditions
        row = await _fetch_lock_row(db, file_id, for_update=True)

        # If only 1 person (me), grant immediately
        if len(active_users) <= 1:
            log.info("🚶 Single user - granting lock")
            await _upsert_lock(db, file_id, user_id, "LOCKED", now + LOCK_TIMEOUT)
            await db.flush()
            result = await _fetch_lock_row(db, file_id)
            await db.commit()
            return _as_state_dict_row(result)

        # Multiple users - check lock state (row is already locked via FOR UPDATE)
        # If unlocked, grant to first requester
        if not row or row.get("state") == "UNLOCKED" or not row.get("holder_user_id"):
            log.info("🔓 Multi-user, unlocked - granting to first requester")
            await _upsert_lock(db, file_id, user_id, "LOCKED", now + LOCK_TIMEOUT)
            await db.flush()
            result = await _fetch_lock_row(db, file_id)
            await db.commit()
            return _as_state_dict_row(result)

        # If I already hold it, renew
        if str(row.get("holder_user_id")) == str(user_id):
            log.info("🔄 Already holds lock - renewing")
            await _upsert_lock(db, file_id, user_id, "LOCKED", now + LOCK_TIMEOUT)
            await db.flush()
            result = await _fetch_lock_row(db, file_id)
            await db.commit()
            return _as_state_dict_row(result)

        # Someone else holds it - blocked
        log.info("🚫 Blocked: another user holds the lock (holder=%s)", row.get("holder_user_id"))
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="File is being edited by another user. Please wait."
        )

async def release_lock(db: AsyncSession, file_id: uuid.UUID, user_id: uuid.UUID) -> Dict[str, Any]:
    """
    Atomically release a lock with ownership verification.
    Uses SELECT FOR UPDATE to prevent race conditions.
    """
    await _cleanup_expired(db)

    async with db.begin_nested():
        # Lock the row exclusively to prevent concurrent modifications
        row = await _fetch_lock_row(db, file_id, for_update=True)

        if not row or row.get("state") == "UNLOCKED":
            await db.commit()
            return _as_state_dict_row(row)

        # Verify ownership before releasing
        if str(row.get("holder_user_id")) != str(user_id):
            await db.commit()
            raise HTTPException(status_code=403, detail="You do not hold this lock.")

        log.info("🔓 Releasing lock for user %s", user_id)
        await _unlock(db, file_id)
        await db.flush()
        await db.commit()

        return {"state": "UNLOCKED"}

async def heartbeat(db: AsyncSession, file_id: uuid.UUID, user_id: uuid.UUID) -> Dict[str, Any]:
    """
    Atomically extend lock expiration with ownership verification.
    Uses SELECT FOR UPDATE to prevent race conditions.
    """
    await _cleanup_expired(db)

    async with db.begin_nested():
        # Lock the row exclusively to prevent concurrent modifications
        row = await _fetch_lock_row(db, file_id, for_update=True)

        if not row or row.get("state") == "UNLOCKED":
            await db.commit()
            raise HTTPException(status_code=404, detail="No active lock.")

        # Verify ownership before extending
        if str(row.get("holder_user_id")) != str(user_id):
            await db.commit()
            raise HTTPException(status_code=403, detail="You are not the lock holder.")

        log.info("💓 Heartbeat from user %s", user_id)
        await _upsert_lock(db, file_id, user_id, "LOCKED", _now() + LOCK_TIMEOUT)
        await db.flush()
        result = await _fetch_lock_row(db, file_id)
        await db.commit()

        return _as_state_dict_row(result)

# -------------------- background tasks --------------------

_cleanup_task = None
_cleanup_running = False

async def start_lock_cleanup_task():
    """
    Start background task for continuous lock expiration monitoring.
    This ensures locks are cleaned up even if no requests arrive.
    """
    global _cleanup_running, _cleanup_task

    if _cleanup_running:
        log.warning("Lock cleanup task is already running")
        return

    _cleanup_running = True
    log.info("🧹 Starting continuous lock cleanup task (interval: %s seconds)", CLEANUP_INTERVAL.total_seconds())

    async def cleanup_loop():
        while _cleanup_running:
            try:
                async with AsyncSessionLocal() as db:
                    count = await _cleanup_expired(db)
                    if count > 0:
                        log.info("🧹 Cleaned up %d expired lock(s)", count)
            except Exception as e:
                log.error("Error in lock cleanup task: %s", e, exc_info=True)

            # Wait before next cleanup
            await asyncio.sleep(CLEANUP_INTERVAL.total_seconds())

    _cleanup_task = asyncio.create_task(cleanup_loop())
    return _cleanup_task

async def stop_lock_cleanup_task():
    """
    Stop the background lock cleanup task gracefully.
    """
    global _cleanup_running, _cleanup_task

    if not _cleanup_running:
        return

    log.info("🛑 Stopping lock cleanup task")
    _cleanup_running = False

    if _cleanup_task:
        _cleanup_task.cancel()
        try:
            await _cleanup_task
        except asyncio.CancelledError:
            pass
        _cleanup_task = None