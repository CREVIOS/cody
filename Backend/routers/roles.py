from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/roles", tags=["roles"])

@router.post("/", response_model=schemas.Role, status_code=status.HTTP_201_CREATED)
async def create_role(
    role_in: schemas.RoleCreate,
    db: AsyncSession = Depends(get_db)
):
    # Check if role name already exists
    existing_role = await crud.crud_role.get_by_name(db, role_name=role_in.role_name)
    if existing_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role name already exists"
        )
    
    return await crud.crud_role.create(db, obj_in=role_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.Role])
async def read_roles(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    roles = await crud.crud_role.get_multi(db, skip=skip, limit=limit)
    total = await crud.crud_role.count(db)
    
    return schemas.PaginatedResponse[schemas.Role](
        items=roles,
        total=total,
        page=skip // limit + 1,
        size=len(roles),
        pages=(total + limit - 1) // limit
    )

@router.get("/{role_id}", response_model=schemas.Role)
async def read_role(
    role_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    role = await crud.crud_role.get(db, id=role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found"
        )
    return role

@router.put("/{role_id}", response_model=schemas.Role)
async def update_role(
    role_id: UUID,
    role_update: schemas.RoleUpdate,
    db: AsyncSession = Depends(get_db)
):
    role = await crud.crud_role.get(db, id=role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found"
        )
    
    # If role name is being updated, check for duplicates
    if role_update.role_name and role_update.role_name != role.role_name:
        existing_role = await crud.crud_role.get_by_name(db, role_name=role_update.role_name)
        if existing_role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role name already exists"
            )
    
    return await crud.crud_role.update(db, db_obj=role, obj_in=role_update)

@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    role = await crud.crud_role.remove(db, id=role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found"
        )

@router.get("/{role_id}/permissions", response_model=schemas.Role)
async def get_role_permissions(
    role_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get role with its permissions by role ID"""
    role = await crud.crud_role.get(db, id=role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found"
        )
    return role

