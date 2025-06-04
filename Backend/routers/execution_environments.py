from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/execution-environments", tags=["execution-environments"])

@router.post("/", response_model=schemas.ExecutionEnvironment, status_code=status.HTTP_201_CREATED)
async def create_execution_environment(
    env_in: schemas.ExecutionEnvironmentCreate,
    db: AsyncSession = Depends(get_db)
):
    # Check if environment name already exists
    existing_env = await crud.crud_execution_environment.get_by_name(db, environment_name=env_in.environment_name)
    if existing_env:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Environment name already exists"
        )
    
    return await crud.crud_execution_environment.create(db, obj_in=env_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.ExecutionEnvironment])
async def read_execution_environments(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    language: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if language:
        filters["language"] = language
    if is_active is not None:
        filters["is_active"] = is_active
    
    environments = await crud.crud_execution_environment.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_execution_environment.count(db, **filters)
    
    return schemas.PaginatedResponse[schemas.ExecutionEnvironment](
        items=environments,
        total=total,
        page=skip // limit + 1,
        size=len(environments),
        pages=(total + limit - 1) // limit
    )

@router.get("/{environment_id}", response_model=schemas.ExecutionEnvironment)
async def read_execution_environment(
    environment_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    environment = await crud.crud_execution_environment.get(db, id=environment_id)
    if not environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution environment not found"
        )
    return environment

@router.put("/{environment_id}", response_model=schemas.ExecutionEnvironment)
async def update_execution_environment(
    environment_id: UUID,
    env_update: schemas.ExecutionEnvironmentUpdate,
    db: AsyncSession = Depends(get_db)
):
    environment = await crud.crud_execution_environment.get(db, id=environment_id)
    if not environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution environment not found"
        )
    
    # If environment name is being updated, check for duplicates
    if env_update.environment_name and env_update.environment_name != environment.environment_name:
        existing_env = await crud.crud_execution_environment.get_by_name(db, environment_name=env_update.environment_name)
        if existing_env:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Environment name already exists"
            )
    
    return await crud.crud_execution_environment.update(db, db_obj=environment, obj_in=env_update)

@router.delete("/{environment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_execution_environment(
    environment_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    environment = await crud.crud_execution_environment.remove(db, id=environment_id)
    if not environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution environment not found"
        ) 