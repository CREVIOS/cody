from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db
from services.permission_enforcer import evaluate_user_permission

router = APIRouter(prefix="/directories", tags=["directories"])

@router.post("", response_model=schemas.Directory, status_code=status.HTTP_201_CREATED)
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
    
    # Permission: creator must be able to edit in this project
    permission_eval = await evaluate_user_permission(
        db,
        project_id=directory_in.project_id,
        user_id=directory_in.created_by,
        permission="canEdit",
    )
    if not permission_eval.granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=permission_eval.reason or "User lacks canEdit permission",
        )
    
    return await crud.crud_directory.create(db, obj_in=directory_in)

@router.get("", response_model=schemas.PaginatedResponse[schemas.Directory])
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
    db: AsyncSession = Depends(get_db),
    actor_id: UUID = Query(..., description="User performing the action"),
):
    directory = await crud.crud_directory.get(db, id=directory_id)
    if not directory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Directory not found"
        )
    # Permission: actor must be able to edit in this project
    permission_eval = await evaluate_user_permission(
        db,
        project_id=directory.project_id,
        user_id=actor_id,
        permission="canEdit",
    )
    if not permission_eval.granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=permission_eval.reason or "User lacks canEdit permission",
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
    db: AsyncSession = Depends(get_db),
    actor_id: UUID = Query(..., description="User performing the action"),
):
    directory = await crud.crud_directory.get(db, id=directory_id)
    if not directory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Directory not found"
        ) 
    # Permission: actor must be able to edit in this project to delete
    permission_eval = await evaluate_user_permission(
        db,
        project_id=directory.project_id,
        user_id=actor_id,
        permission="canEdit",
    )
    if not permission_eval.granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=permission_eval.reason or "User lacks canEdit permission",
        )
    await crud.crud_directory.remove(db, id=directory_id)
