from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from db import get_db
import lock_service

router = APIRouter(prefix="/locks", tags=["locks"])

@router.get("/{file_id}/state")
async def get_lock_state(file_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get current lock state for a file."""
    state = await lock_service.get_state(db, file_id)
    return {"state": state}

@router.post("/{file_id}/request")
async def request_lock(file_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Request a lock on a file.
    - Owners/admins get immediate access (preempt)
    - Editors queue if someone else holds the lock
    - Viewers are always read-only
    """
    body = await request.json()
    user_id_str = body.get("user_id")
    role = body.get("role", "editor")
    
    if not user_id_str:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid user_id format")

    print(f"🔍 Lock request: file={file_id} user={user_id} role={role}")

    try:
        # Let lock_service handle all role logic (owner preemption, editor queueing, etc.)
        state = await lock_service.request_lock(db, file_id, user_id, role)
        return {"state": state}
    except HTTPException:
        # Re-raise HTTPExceptions (like 409 Conflict for queuing)
        raise
    except Exception as e:
        print(f"❌ Lock request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{file_id}/release")
async def release_lock(file_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Release a lock and hand off to next in queue if present.
    """
    body = await request.json()
    user_id_str = body.get("user_id")
    
    if not user_id_str:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid user_id format")
    
    print(f"🔓 Release lock: file={file_id} user={user_id}")
    
    try:
        state = await lock_service.release_lock(db, file_id, user_id)
        return {"state": state}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Lock release failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{file_id}/heartbeat")
async def heartbeat(file_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Renew lock expiration for current holder.
    """
    body = await request.json()
    user_id_str = body.get("user_id")
    
    if not user_id_str:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid user_id format")
    
    print(f"💓 Heartbeat: file={file_id} user={user_id}")
    
    try:
        state = await lock_service.heartbeat(db, file_id, user_id)
        return {"state": state}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Heartbeat failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))