from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID, uuid5
from typing import Optional
from db import get_db
import lock_service
import crud
import models

router = APIRouter(prefix="/locks", tags=["locks"])

async def resolve_file_identifier(
    file_identifier: str,
    db: AsyncSession,
    project_id: Optional[UUID] = None
) -> UUID:
    """
    Resolve a file identifier to a file_id UUID.
    - If file_identifier is a valid UUID, return it directly
    - If it's a file path, generate a deterministic UUID v5 from project_id + file_path
      (since files are stored in Docker containers/MinIO, not in the database)
    """
    # Try to parse as UUID first
    try:
        return UUID(file_identifier)
    except (ValueError, TypeError):
        pass
    
    # If not a UUID, treat as file path and generate deterministic UUID
    if not project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id is required when using file path instead of file_id"
        )
    
    # Generate a deterministic UUID v5 from project_id + file_path
    # This ensures the same file path in the same project always gets the same UUID
    # Namespace UUID for file paths (arbitrary but consistent)
    namespace_uuid = UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')  # Standard namespace UUID
    
    # Create a unique string from project_id + file_path
    unique_string = f"{project_id}:{file_identifier}"
    
    # Generate UUID v5 (deterministic) using Python's uuid5 function
    return uuid5(namespace_uuid, unique_string)

@router.get("/{file_identifier}/state")
async def get_lock_state(
    file_identifier: str,
    db: AsyncSession = Depends(get_db),
    project_id: Optional[UUID] = Query(None, description="Project ID (required when using file path)"),
    user_id: Optional[UUID] = Query(None, description="Current user ID (for canEdit calculation)")
):
    """
    Get current lock state for a file. Accepts either file_id UUID or file path.
    Auto-expires stale locks (last_seen > 15s).
    Returns Phase 5 format with canEdit and expires_in.
    """
    file_id = await resolve_file_identifier(file_identifier, db, project_id)
    state = await lock_service.get_state(db, file_id, current_user_id=user_id)
    return {"state": state}

@router.post("/{file_identifier}/request")
async def request_lock(
    file_identifier: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    project_id: Optional[UUID] = Query(None, description="Project ID (required when using file path)")
):
    """
    Request a lock on a file. Accepts either file_id UUID or file path.
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

    file_id = await resolve_file_identifier(file_identifier, db, project_id)
    print(f"🔍 Lock request: file={file_id} (from {file_identifier}) user={user_id} role={role}")

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

@router.post("/{file_identifier}/release")
async def release_lock(
    file_identifier: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    project_id: Optional[UUID] = Query(None, description="Project ID (required when using file path)")
):
    """
    Release a lock and hand off to next in queue if present.
    Accepts either file_id UUID or file path.
    """
    body = await request.json()
    user_id_str = body.get("user_id")
    
    if not user_id_str:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid user_id format")
    
    file_id = await resolve_file_identifier(file_identifier, db, project_id)
    print(f"🔓 Release lock: file={file_id} (from {file_identifier}) user={user_id}")
    
    try:
        state = await lock_service.release_lock(db, file_id, user_id)
        return {"state": state}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Lock release failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{file_identifier}/heartbeat")
async def heartbeat(
    file_identifier: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    project_id: Optional[UUID] = Query(None, description="Project ID (required when using file path)")
):
    """
    Renew lock expiration for current holder.
    Accepts either file_id UUID or file path.
    """
    body = await request.json()
    user_id_str = body.get("user_id")
    
    if not user_id_str:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid user_id format")
    
    file_id = await resolve_file_identifier(file_identifier, db, project_id)
    print(f"💓 Heartbeat: file={file_id} (from {file_identifier}) user={user_id}")
    
    try:
        state = await lock_service.heartbeat(db, file_id, user_id)
        return {"state": state}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Heartbeat failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))