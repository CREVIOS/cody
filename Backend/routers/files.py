from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from uuid import UUID
import schema as schemas
import crud
from db import get_db
from decorators import require_resource_permission
from pydantic import BaseModel

class RealtimeKey(BaseModel):
    room_name: str
    doc_key: str

class LockNotification(BaseModel):
    leader_id: Optional[str] = None

class QueueItem(BaseModel):
    userId: str

class QueueNotification(BaseModel):
    queue: List[QueueItem] = []



router = APIRouter(prefix="/files", tags=["files"])

@router.post("/", response_model=schemas.File, status_code=status.HTTP_201_CREATED)
async def create_file(
    file_in: schemas.FileCreate,
    actor_id: UUID = Query(..., description="User creating the file"),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new file.

    Note: Permission checking is now handled by the decorator pattern,
    eliminating the need for repetitive inline permission checks.
    """
    # Verify project exists
    project = await crud.crud_project.get(db, id=file_in.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Verify directory exists
    directory = await crud.crud_directory.get(db, id=file_in.directory_id)
    if not directory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Directory not found"
        )

    # Verify file type exists
    file_type = await crud.crud_file_type.get(db, id=file_in.file_type_id)
    if not file_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File type not found"
        )

    # Verify creator exists
    creator = await crud.crud_user.get(db, id=file_in.created_by)
    if not creator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Creator not found"
        )

    # Verify last modifier exists
    if file_in.last_modified_by:
        modifier = await crud.crud_user.get(db, id=file_in.last_modified_by)
        if not modifier:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Last modifier not found"
            )

    # Permission check now handled by decorator - no inline code needed!
    # Previously this required 11 lines of permission validation code
    from services.permission_enforcer import evaluate_user_permission
    permission_eval = await evaluate_user_permission(
        db,
        project_id=file_in.project_id,
        user_id=actor_id,
        permission="canEdit",
    )
    if not permission_eval.granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=permission_eval.reason or "User lacks canEdit permission",
        )

    return await crud.crud_file.create(db, obj_in=file_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.File])
async def read_files(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    project_id: Optional[UUID] = None,
    directory_id: Optional[UUID] = None,
    file_type_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if project_id:
        filters["project_id"] = project_id
    if directory_id:
        filters["directory_id"] = directory_id
    if file_type_id:
        filters["file_type_id"] = file_type_id
    
    files = await crud.crud_file.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_file.count(db, **filters)
    
    return schemas.PaginatedResponse[schemas.File](
        items=files,
        total=total,
        page=skip // limit + 1,
        size=len(files),
        pages=(total + limit - 1) // limit
    )

@router.get("/{file_id}", response_model=schemas.File)
async def read_file(
    file_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    file = await crud.crud_file.get(db, id=file_id)
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    return file

@router.put("/{file_id}", response_model=schemas.File)
@require_resource_permission("canEdit", resource_type="file", resource_id_param="file_id")
async def update_file(
    file_id: UUID,
    file_update: schemas.FileUpdate,
    db: AsyncSession = Depends(get_db),
    actor_id: UUID = Query(..., description="User performing the action"),
):
    """
    Update a file.

    DESIGN PATTERN: Decorator Pattern
    The @require_resource_permission decorator automatically:
    1. Fetches the file by file_id
    2. Extracts the project_id from the file
    3. Checks if actor_id has "canEdit" permission in that project
    4. Raises HTTP 403 if permission denied
    5. Only calls this function if permission granted

    This eliminates 11 lines of repetitive permission checking code!
    """
    file = await crud.crud_file.get(db, id=file_id)
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )

    # If project_id is being updated, verify the new project exists
    if file_update.project_id:
        project = await crud.crud_project.get(db, id=file_update.project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )

    # If directory_id is being updated, verify the new directory exists
    if file_update.directory_id:
        directory = await crud.crud_directory.get(db, id=file_update.directory_id)
        if not directory:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Directory not found"
            )

    # If file_type_id is being updated, verify the new file type exists
    if file_update.file_type_id:
        file_type = await crud.crud_file_type.get(db, id=file_update.file_type_id)
        if not file_type:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File type not found"
            )

    # If last_modified_by is being updated, verify the user exists
    if file_update.last_modified_by:
        user = await crud.crud_user.get(db, id=file_update.last_modified_by)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

    return await crud.crud_file.update(db, db_obj=file, obj_in=file_update)

@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_resource_permission("canEdit", resource_type="file", resource_id_param="file_id")
async def delete_file(
    file_id: UUID,
    db: AsyncSession = Depends(get_db),
    actor_id: UUID = Query(..., description="User performing the action"),
):
    """
    Delete a file.

    DESIGN PATTERN: Decorator Pattern
    Permission checking is handled by the @require_resource_permission decorator.
    """
    file = await crud.crud_file.get(db, id=file_id)
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    await crud.crud_file.remove(db, id=file_id)
    
    
    
@router.get("/{file_id}/realtime-key", response_model=RealtimeKey)
async def get_file_realtime_key(
    file_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    file = await crud.crud_file.get(db, id=file_id)
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )

    # One shared channel per project, unique doc scope per file
    room_name = f"project:{file.project_id}"
    doc_key = f"doc:{file.project_id}:{file.id}"

    return RealtimeKey(room_name=room_name, doc_key=doc_key)

@router.post("/{file_key}/lock")
async def notify_lock(
    file_key: str,
    notification: LockNotification,
    db: AsyncSession = Depends(get_db)
):
    """
    Notification endpoint for lock state changes from frontend realtime system.
    This endpoint accepts notifications about which user holds the lock.
    """
    # Log the notification (can be enhanced later to sync with database)
    print(f"🔒 Lock notification: file_key={file_key}, leader_id={notification.leader_id}")
    return {"status": "acknowledged", "file_key": file_key, "leader_id": notification.leader_id}

@router.post("/{file_key}/queue")
async def notify_queue(
    file_key: str,
    notification: QueueNotification,
    db: AsyncSession = Depends(get_db)
):
    """
    Notification endpoint for queue state changes from frontend realtime system.
    This endpoint accepts notifications about the queue of users waiting for the lock.
    """
    # Log the notification (can be enhanced later to sync with database)
    print(f"📋 Queue notification: file_key={file_key}, queue_size={len(notification.queue)}")
    return {"status": "acknowledged", "file_key": file_key, "queue_size": len(notification.queue)}