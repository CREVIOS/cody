from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/file-versions", tags=["file-versions"])

@router.post("/", response_model=schemas.FileVersion, status_code=status.HTTP_201_CREATED)
async def create_file_version(
    version_in: schemas.FileVersionCreate,
    db: AsyncSession = Depends(get_db)
):
    # Verify file exists
    file = await crud.crud_file.get(db, id=version_in.file_id)
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # Verify creator exists
    creator = await crud.crud_user.get(db, id=version_in.created_by)
    if not creator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Creator not found"
        )
    
    # Check if user is a member of the project
    member = await crud.crud_project_member.get_by_project_and_user(
        db, project_id=file.project_id, user_id=version_in.created_by
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this project"
        )
    
    return await crud.crud_file_version.create(db, obj_in=version_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.FileVersion])
async def read_file_versions(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    file_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if file_id:
        filters["file_id"] = file_id
    
    versions = await crud.crud_file_version.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_file_version.count(db, **filters)
    
    return schemas.PaginatedResponse[schemas.FileVersion](
        items=versions,
        total=total,
        page=skip // limit + 1,
        size=len(versions),
        pages=(total + limit - 1) // limit
    )

@router.get("/{version_id}", response_model=schemas.FileVersion)
async def read_file_version(
    version_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    version = await crud.crud_file_version.get(db, id=version_id)
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File version not found"
        )
    return version

@router.get("/{version_id}/content")
async def get_file_version_content(
    version_id: UUID,
    project_id: UUID = Query(..., description="Project ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Phase 6: Get the content of a specific file version.
    Fetches content from MinIO using the version_link stored in the database.
    """
    import httpx
    import os
    import re
    
    version = await crud.crud_file_version.get(db, id=version_id)
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File version not found"
        )
    
    # Extract MinIO version ID from version_link
    # Format: minio://{project_id}/{file_path}#{version_id}
    version_link = version.version_link
    minio_version_match = re.search(r'#([^#]+)$', version_link)
    minio_version_id = minio_version_match.group(1) if minio_version_match else None
    
    # Extract file path from version_link
    file_path_match = re.search(r'minio://[^/]+/(.+?)(?:#|$)', version_link)
    file_path = file_path_match.group(1) if file_path_match else None
    
    if not file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid version_link format"
        )
    
    # Fetch content from SBackend
    sbackend_url = os.getenv("SBACKEND_URL", "http://localhost:3001")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if minio_version_id:
                # Use version-specific endpoint
                response = await client.get(
                    f"{sbackend_url}/api/projects/{project_id}/files/version/{minio_version_id}",
                    params={"path": file_path}
                )
            else:
                # Fallback to current file content
                response = await client.get(
                    f"{sbackend_url}/api/projects/{project_id}/files/read",
                    params={"path": file_path}
                )
            
            response.raise_for_status()
            result = response.json()
            
            if not result.get("success"):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to fetch version content: {result.get('error', 'Unknown error')}"
                )
            
            return {
                "versionId": str(version.version_id),
                "content": result.get("content", ""),
                "size": version.size_in_bytes,
                "createdAt": version.created_at.isoformat(),
                "createdBy": str(version.created_by)
            }
            
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"SBackend service unavailable: {str(e)}"
        )

@router.put("/{version_id}", response_model=schemas.FileVersion)
async def update_file_version(
    version_id: UUID,
    version_update: schemas.FileVersionUpdate,
    db: AsyncSession = Depends(get_db)
):
    version = await crud.crud_file_version.get(db, id=version_id)
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File version not found"
        )
    
    # If file_id is being updated, verify the new file exists
    if version_update.file_id:
        file = await crud.crud_file.get(db, id=version_update.file_id)
        if not file:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found"
            )
    
    return await crud.crud_file_version.update(db, db_obj=version, obj_in=version_update)

@router.delete("/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file_version(
    version_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    version = await crud.crud_file_version.remove(db, id=version_id)
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File version not found"
        ) 