from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/files", tags=["files"])

@router.post("/", response_model=schemas.File, status_code=status.HTTP_201_CREATED)
async def create_file(
    file_in: schemas.FileCreate,
    db: AsyncSession = Depends(get_db)
):
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
    
    # Check if user is a member of the project
    member = await crud.crud_project_member.get_by_project_and_user(
        db, project_id=file_in.project_id, user_id=file_in.created_by
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this project"
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
async def update_file(
    file_id: UUID,
    file_update: schemas.FileUpdate,
    db: AsyncSession = Depends(get_db)
):
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
async def delete_file(
    file_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    file = await crud.crud_file.remove(db, id=file_id)
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        ) 