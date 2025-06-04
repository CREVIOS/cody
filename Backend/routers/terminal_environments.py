from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/terminal-environments", tags=["terminal-environments"])

@router.post("/", response_model=schemas.TerminalEnvironment, status_code=status.HTTP_201_CREATED)
async def create_terminal_environment(
    env_in: schemas.TerminalEnvironmentCreate,
    db: AsyncSession = Depends(get_db)
):
    # Check if environment name already exists
    existing_env = await crud.crud_terminal_environment.get_by_name(db, environment_name=env_in.environment_name)
    if existing_env:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Environment name already exists"
        )
    
    return await crud.crud_terminal_environment.create(db, obj_in=env_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.TerminalEnvironment])
async def read_terminal_environments(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    os_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if os_type:
        filters["os_type"] = os_type
    if is_active is not None:
        filters["is_active"] = is_active
    
    environments = await crud.crud_terminal_environment.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_terminal_environment.count(db, **filters)
    
    return schemas.PaginatedResponse[schemas.TerminalEnvironment](
        items=environments,
        total=total,
        page=skip // limit + 1,
        size=len(environments),
        pages=(total + limit - 1) // limit
    )

@router.get("/{environment_id}", response_model=schemas.TerminalEnvironment)
async def read_terminal_environment(
    environment_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    environment = await crud.crud_terminal_environment.get(db, id=environment_id)
    if not environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Terminal environment not found"
        )
    return environment

@router.put("/{environment_id}", response_model=schemas.TerminalEnvironment)
async def update_terminal_environment(
    environment_id: UUID,
    env_update: schemas.TerminalEnvironmentUpdate,
    db: AsyncSession = Depends(get_db)
):
    environment = await crud.crud_terminal_environment.get(db, id=environment_id)
    if not environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Terminal environment not found"
        )
    
    # If environment name is being updated, check for duplicates
    if env_update.environment_name and env_update.environment_name != environment.environment_name:
        existing_env = await crud.crud_terminal_environment.get_by_name(db, environment_name=env_update.environment_name)
        if existing_env:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Environment name already exists"
            )
    
    return await crud.crud_terminal_environment.update(db, db_obj=environment, obj_in=env_update)

@router.delete("/{environment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_terminal_environment(
    environment_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    environment = await crud.crud_terminal_environment.remove(db, id=environment_id)
    if not environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Terminal environment not found"
        ) 