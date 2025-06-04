from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/project-members", tags=["project-members"])

@router.post("/", response_model=schemas.ProjectMember, status_code=status.HTTP_201_CREATED)
async def create_project_member(
    member_in: schemas.ProjectMemberCreate,
    db: AsyncSession = Depends(get_db)
):
    # Verify project exists
    project = await crud.crud_project.get(db, id=member_in.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Verify user exists
    user = await crud.crud_user.get(db, id=member_in.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Verify role exists
    role = await crud.crud_role.get(db, id=member_in.role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found"
        )
    
    # Check if user is already a member of the project
    existing_member = await crud.crud_project_member.get_by_project_and_user(
        db, project_id=member_in.project_id, user_id=member_in.user_id
    )
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member of this project"
        )
    
    return await crud.crud_project_member.create(db, obj_in=member_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.ProjectMember])
async def read_project_members(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    project_id: Optional[UUID] = None,
    user_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if project_id:
        filters["project_id"] = project_id
    if user_id:
        filters["user_id"] = user_id
    
    members = await crud.crud_project_member.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_project_member.count(db, **filters)
    
    return schemas.PaginatedResponse[schemas.ProjectMember](
        items=members,
        total=total,
        page=skip // limit + 1,
        size=len(members),
        pages=(total + limit - 1) // limit
    )

@router.get("/{member_id}", response_model=schemas.ProjectMember)
async def read_project_member(
    member_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    member = await crud.crud_project_member.get(db, id=member_id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project member not found"
        )
    return member

@router.put("/{member_id}", response_model=schemas.ProjectMember)
async def update_project_member(
    member_id: UUID,
    member_update: schemas.ProjectMemberUpdate,
    db: AsyncSession = Depends(get_db)
):
    member = await crud.crud_project_member.get(db, id=member_id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project member not found"
        )
    
    # If role is being updated, verify the new role exists
    if member_update.role_id:
        role = await crud.crud_role.get(db, id=member_update.role_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Role not found"
            )
    
    return await crud.crud_project_member.update(db, db_obj=member, obj_in=member_update)

@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_member(
    member_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    member = await crud.crud_project_member.remove(db, id=member_id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project member not found"
        ) 