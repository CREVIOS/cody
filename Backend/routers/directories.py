from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/directories", tags=["directories"])

@router.post("/", response_model=schemas.Directory, status_code=status.HTTP_201_CREATED)
async def create_directory(
    directory_in: schemas.DirectoryCreate,
    db: AsyncSession = Depends(get_db)
):
    # Verify project exists
    project = await crud.crud_project.get(db, id=directory_in.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Verify user exists
    user = await crud.crud_user.get(db, id=directory_in.created_by)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if user is a member of the project
    member = await crud.crud_project_member.get_by_project_and_user(
        db, project_id=directory_in.project_id, user_id=directory_in.created_by
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this project"
        )
    
    return await crud.crud_directory.create(db, obj_in=directory_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.Directory])
async def read_directories(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    project_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if project_id:
        filters["project_id"] = project_id
    
    directories = await crud.crud_directory.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_directory.count(db, **filters)
    
    return schemas.PaginatedResponse[schemas.Directory](
        items=directories,
        total=total,
        page=skip // limit + 1,
        size=len(directories),
        pages=(total + limit - 1) // limit
    )

@router.get("/{directory_id}", response_model=schemas.Directory)
async def read_directory(
    directory_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    directory = await crud.crud_directory.get(db, id=directory_id)
    if not directory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Directory not found"
        )
    return directory

@router.put("/{directory_id}", response_model=schemas.Directory)
async def update_directory(
    directory_id: UUID,
    directory_update: schemas.DirectoryUpdate,
    db: AsyncSession = Depends(get_db)
):
    directory = await crud.crud_directory.get(db, id=directory_id)
    if not directory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Directory not found"
        )
    
    # If project_id is being updated, verify the new project exists
    if directory_update.project_id:
        project = await crud.crud_project.get(db, id=directory_update.project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
    
    return await crud.crud_directory.update(db, db_obj=directory, obj_in=directory_update)

@router.delete("/{directory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_directory(
    directory_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    directory = await crud.crud_directory.remove(db, id=directory_id)
    if not directory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Directory not found"
        ) 