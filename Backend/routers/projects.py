from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/projects", tags=["projects"])

@router.post("/", response_model=schemas.Project, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_in: schemas.ProjectCreate,
    db: AsyncSession = Depends(get_db)
):
    # Verify owner exists
    owner = await crud.crud_user.get(db, id=project_in.owner_id)
    if not owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Owner not found"
        )
    
    return await crud.crud_project.create(db, obj_in=project_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.Project])
async def read_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    owner_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if owner_id:
        filters["owner_id"] = owner_id
    
    projects = await crud.crud_project.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_project.count(db, **filters)
    
    return schemas.PaginatedResponse[schemas.Project](
        items=projects,
        total=total,
        page=skip // limit + 1,
        size=len(projects),
        pages=(total + limit - 1) // limit
    )

@router.get("/{project_id}", response_model=schemas.Project)
async def read_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    project = await crud.crud_project.get(db, id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    return project

@router.put("/{project_id}", response_model=schemas.Project)
async def update_project(
    project_id: UUID,
    project_update: schemas.ProjectUpdate,
    db: AsyncSession = Depends(get_db)
):
    project = await crud.crud_project.get(db, id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return await crud.crud_project.update(db, db_obj=project, obj_in=project_update)

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    project = await crud.crud_project.remove(db, id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

