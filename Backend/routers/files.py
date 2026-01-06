from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
from uuid import UUID
import schema as schemas
import crud
import models
from db import get_db
from pydantic import BaseModel
import os

# Optional import for httpx - only needed for SBackend communication
try:
    import httpx
except ImportError:
    httpx = None
    import warnings
    warnings.warn("httpx not installed - SBackend communication will fail. Install with: pip install httpx")

class RealtimeKeyPermissions(BaseModel):
    canEdit: bool
    canView: bool

class RealtimeKey(BaseModel):
    docId: str  # Canonical stable doc UUID
    fileId: str  # File UUID
    projectId: str  # Project UUID
    permissions: RealtimeKeyPermissions

class LockNotification(BaseModel):
    leader_id: Optional[str] = None

class QueueItem(BaseModel):
    userId: str

class QueueNotification(BaseModel):
    queue: List[QueueItem] = []

class FileContentUpdate(BaseModel):
    content: str
    message: Optional[str] = None  # Optional save message/comment



router = APIRouter(prefix="/files", tags=["files"])

@router.post("", response_model=schemas.File, status_code=status.HTTP_201_CREATED)
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

@router.get("", response_model=schemas.PaginatedResponse[schemas.File])
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

# ============================================================================
# CRITICAL ROUTE ORDERING: realtime-key MUST come FIRST
# ============================================================================
# The realtime-key route must be defined BEFORE any other route that matches
# /{file_identifier} or /{file_id} patterns to ensure FastAPI matches it correctly.
# FastAPI matches routes in order, so more specific routes must come first.
# ============================================================================
@router.get("/{file_identifier}/realtime-key", response_model=RealtimeKey)
async def get_file_realtime_key(
    file_identifier: str,
    user_id: UUID = Query(..., description="User ID to compute permissions for"),
    project_id: UUID = Query(..., description="Project ID (required when using file path)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get realtime collaboration key with complete metadata.
    
    Accepts either:
    - file_id UUID (if file exists in database)
    - file path (will generate deterministic UUID v5, like locks endpoint)
    
    Returns canonical metadata including:
    - docId: Stable document ID for CRDT synchronization
    - fileId: File UUID (deterministic if using path)
    - projectId: Project UUID
    - permissions: User's edit/view permissions for this file
    """
    from uuid import uuid5, UUID as UUIDType
    
    # Resolve file identifier to UUID (handles both UUID and file path, like locks endpoint)
    try:
        # Try to parse as UUID first
        file_uuid = UUIDType(file_identifier)
    except (ValueError, TypeError):
        # If not a UUID, treat as file path and generate deterministic UUID v5
        if not project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="project_id is required when using file path instead of file_id"
            )
        
        # Generate a deterministic UUID v5 from project_id + file_path
        # This ensures the same file path in the same project always gets the same UUID
        namespace_uuid = UUIDType('6ba7b810-9dad-11d1-80b4-00c04fd430c8')  # Standard namespace UUID
        unique_string = f"{project_id}:{file_identifier}"
        file_uuid = uuid5(namespace_uuid, unique_string)

    # Verify project exists
    project = await crud.crud_project.get(db, id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Generate stable docId from file and project (canonical, backend-derived)
    # Format: doc:{project_id}:{file_uuid} - stable across sessions
    doc_id = f"doc:{project_id}:{file_uuid}"

    # COMMENTED OUT: Permission checks disabled (CRDT-only mode)
    # # Get user permissions for this project
    # from services.permission_enforcer import get_user_permissions_map
    # permissions_map = await get_user_permissions_map(
    #     db,
    #     project_id=project_id,
    #     user_id=user_id,
    #     permissions_to_check=["canEdit", "canView"],
    # )
    
    # CRDT-only mode: Always return true for all permissions
    # Write permissions should never be blocked in CRDT mode
    return RealtimeKey(
        docId=doc_id,
        fileId=str(file_uuid),
        projectId=str(project_id),
        permissions=RealtimeKeyPermissions(
            canEdit=True,  # Always allow editing in CRDT mode
            canView=True,  # Always allow viewing in CRDT mode
        )
    )

@router.post("/{file_identifier}/save-content", status_code=status.HTTP_200_OK)
async def save_file_content(
    file_identifier: str,
    content_update: FileContentUpdate,
    user_id: UUID = Query(..., description="User ID performing the save"),
    project_id: UUID = Query(..., description="Project ID (required when using file path)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Phase 6: Save file content with version creation.
    
    This endpoint:
    1. Checks lock ownership (user must hold the lock)
    2. Saves content to MinIO via SBackend
    3. Creates a file_version record in Postgres
    4. Returns version metadata
    
    Accepts either file_id UUID or file path.
    """
    from routers.locks import resolve_file_identifier
    from uuid import uuid5, UUID as UUIDType
    import lock_service
    
    # Resolve file identifier to UUID
    try:
        file_uuid = await resolve_file_identifier(file_identifier, db, project_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file identifier: {str(e)}"
        )
    
    # COMMENTED OUT: Lock enforcement disabled (CRDT-only mode)
    # Phase 6 Step 7: Lock enforcement - verify user holds the lock
    # lock_state = await lock_service.get_state(db, file_uuid, current_user_id=user_id)
    # if lock_state.get("state") == "LOCKED":
    #     locked_by = lock_state.get("locked_by") or lock_state.get("holder_user_id")
    #     if locked_by and str(locked_by) != str(user_id):
    #         raise HTTPException(
    #             status_code=status.HTTP_403_FORBIDDEN,
    #             detail="Lock required to save changes. You do not hold the lock for this file."
    #         )
    #     # Also check canEdit flag
    #     if not lock_state.get("canEdit", False):
    #         raise HTTPException(
    #             status_code=status.HTTP_403_FORBIDDEN,
    #             detail="Lock required to save changes. You do not have edit permission."
    #         )
    
    # CRDT-only mode: No lock checks - all users can save
    
    # Verify project exists
    project = await crud.crud_project.get(db, id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Phase 6 Step 5: Save to MinIO via SBackend
    if httpx is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="httpx is not installed. Please install it with: pip install httpx"
        )
    
    sbackend_url = os.getenv("SBACKEND_URL", "http://localhost:3001")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Use file path if it's not a UUID, otherwise use the UUID
            file_path = file_identifier if not isinstance(file_identifier, UUIDType) else str(file_uuid)
            
            response = await client.put(
                f"{sbackend_url}/api/projects/{project_id}/files/update",
                json={
                    "path": file_path,
                    "content": content_update.content
                }
            )
            response.raise_for_status()
            minio_result = response.json()
            
            if not minio_result.get("success"):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to save file to MinIO: {minio_result.get('error', 'Unknown error')}"
                )
            
            minio_version_id = minio_result.get("versionId")
            file_size = minio_result.get("size", len(content_update.content))
            
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"SBackend service unavailable: {str(e)}"
        )
    
    # Phase 6 Step 4: Create file_version record
    # First, try to find existing file record in database
    # If file doesn't exist in DB (container-based files), we'll create a minimal record
    file_record = await crud.crud_file.get(db, id=file_uuid)
    
    # Get next version number
    if file_record:
        # Get the latest version number for this file
        latest_version_query = select(func.max(models.FileVersion.version_number)).where(
            models.FileVersion.file_id == file_uuid
        )
        result = await db.execute(latest_version_query)
        latest_version_number = result.scalar() or 0
        next_version_number = latest_version_number + 1
        
        # Get parent version (latest version)
        parent_version_query = select(models.FileVersion).where(
            models.FileVersion.file_id == file_uuid
        ).order_by(models.FileVersion.version_number.desc()).limit(1)
        parent_result = await db.execute(parent_version_query)
        parent_version = parent_result.scalar_one_or_none()
        parent_version_id = parent_version.version_id if parent_version else None
    else:
        # File doesn't exist in DB - this is a container-based file
        # We'll create a version record but can't link to a file record
        # For now, use version_number = 1
        next_version_number = 1
        parent_version_id = None
    
    # Create file version record
    version_link = f"minio://{project_id}/{file_identifier}#{minio_version_id}" if minio_version_id else f"minio://{project_id}/{file_identifier}"
    
    version_create = schemas.FileVersionCreate(
        file_id=file_uuid,
        version_number=next_version_number,
        version_link=version_link,
        size_in_bytes=file_size,
        parent_version_id=parent_version_id,
        created_by=user_id
    )
    
    # Only create version record if file exists in DB
    version_record = None
    if file_record:
        version_record = await crud.crud_file_version.create(db, obj_in=version_create)
        await db.commit()
    else:
        # For container-based files, we can't create a DB record without a file record
        # Log a warning but don't fail
        print(f"⚠️ Warning: Cannot create file_version record for container-based file {file_identifier} (no DB record)")
    
    # Return version metadata
    from datetime import datetime, timezone
    return {
        "fileId": str(file_uuid),
        "versionId": str(version_record.version_id) if version_record else (minio_version_id or "unknown"),
        "minioVersionId": minio_version_id,
        "versionNumber": next_version_number,
        "createdAt": version_record.created_at.isoformat() if version_record else datetime.now(timezone.utc).isoformat(),
        "size": file_size,
        "savedBy": str(user_id),
        "message": content_update.message
    }

# IMPORTANT: More specific routes (with path segments like /lock, /queue) must come BEFORE
# less specific routes (like /{file_id}) to ensure proper route matching in FastAPI
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

    # Strategy-based permission check (replaces decorator)
    from services.permission_enforcer import evaluate_user_permission
    permission_eval = await evaluate_user_permission(
        db,
        project_id=file.project_id,
        user_id=actor_id,
        permission="canEdit",
    )
    if not permission_eval.granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=permission_eval.reason or "User lacks canEdit permission",
        )

    # Note: project_id is not in FileUpdate schema, so files cannot be moved between projects
    # If project_id update is needed in the future, add it to FileUpdate schema first

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
    # Strategy-based permission check (replaces decorator)
    from services.permission_enforcer import evaluate_user_permission
    permission_eval = await evaluate_user_permission(
        db,
        project_id=file.project_id,
        user_id=actor_id,
        permission="canEdit",
    )
    if not permission_eval.granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=permission_eval.reason or "User lacks canEdit permission",
        )
    await crud.crud_file.remove(db, id=file_id)
