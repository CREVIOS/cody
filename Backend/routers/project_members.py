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

@router.get("/by-project/{project_id}", response_model=List[schemas.ProjectMemberWithDetails])
async def get_project_members_with_details(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get all members of a specific project with full user and role details"""
    from sqlalchemy import select, or_
    from sqlalchemy.orm import selectinload
    
    # Verify project exists and load owner details
    project_result = await db.execute(
        select(crud.crud_project.model)
        .where(crud.crud_project.model.project_id == project_id)
        .options(selectinload(crud.crud_project.model.owner))
    )
    project = project_result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Get regular project members (invited users who joined)
    result = await db.execute(
        select(crud.crud_project_member.model)
        .where(crud.crud_project_member.model.project_id == project_id)
        .where(crud.crud_project_member.model.is_active == True)
        .options(
            selectinload(crud.crud_project_member.model.user),
            selectinload(crud.crud_project_member.model.role),
            selectinload(crud.crud_project_member.model.inviter)
        )
    )
    
    members = result.scalars().all()
    
    # Check if owner is already in members list
    owner_is_member = any(member.user_id == project.owner_id for member in members)
    
    # If owner is not in members list, add them with owner role
    if not owner_is_member:
        # Get the "Owner" role
        owner_role_result = await db.execute(
            select(crud.crud_role.model)
            .where(crud.crud_role.model.role_name == "Owner")
        )
        owner_role = owner_role_result.scalar_one_or_none()
        
        if owner_role:
            # Create a virtual member object for the owner
            from types import SimpleNamespace
            owner_member = SimpleNamespace()
            owner_member.project_member_id = f"owner-{project.owner_id}"
            owner_member.project_id = project_id
            owner_member.user_id = project.owner_id
            owner_member.role_id = owner_role.role_id
            owner_member.invited_by = None
            owner_member.joined_at = project.created_at
            owner_member.last_activity = None
            owner_member.is_active = True
            owner_member.user = project.owner
            owner_member.role = owner_role
            owner_member.inviter = None
            
            # Add owner to the beginning of the list
            members = [owner_member] + list(members)
    
    return members 