from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/file-types", tags=["file-types"])

@router.post("/", response_model=schemas.FileType, status_code=status.HTTP_201_CREATED)
async def create_file_type(
    file_type_in: schemas.FileTypeCreate,
    db: AsyncSession = Depends(get_db)
):
    # Check if file type with same name already exists
    existing_type = await crud.crud_file_type.get_by_name(db, type_name=file_type_in.type_name)
    if existing_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type with this name already exists"
        )
    
    return await crud.crud_file_type.create(db, obj_in=file_type_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.FileType])
async def read_file_types(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    file_types = await crud.crud_file_type.get_multi(db, skip=skip, limit=limit)
    total = await crud.crud_file_type.count(db)
    
    return schemas.PaginatedResponse[schemas.FileType](
        items=file_types,
        total=total,
        page=skip // limit + 1,
        size=len(file_types),
        pages=(total + limit - 1) // limit
    )

@router.get("/{file_type_id}", response_model=schemas.FileType)
async def read_file_type(
    file_type_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    file_type = await crud.crud_file_type.get(db, id=file_type_id)
    if not file_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File type not found"
        )
    return file_type

@router.put("/{file_type_id}", response_model=schemas.FileType)
async def update_file_type(
    file_type_id: UUID,
    file_type_update: schemas.FileTypeUpdate,
    db: AsyncSession = Depends(get_db)
):
    file_type = await crud.crud_file_type.get(db, id=file_type_id)
    if not file_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File type not found"
        )
    
    # If type_name is being updated, check for duplicates
    if file_type_update.type_name and file_type_update.type_name != file_type.type_name:
        existing_type = await crud.crud_file_type.get_by_name(db, type_name=file_type_update.type_name)
        if existing_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File type with this name already exists"
            )
    
    return await crud.crud_file_type.update(db, db_obj=file_type, obj_in=file_type_update)

@router.delete("/{file_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file_type(
    file_type_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    file_type = await crud.crud_file_type.remove(db, id=file_type_id)
    if not file_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File type not found"
        ) 