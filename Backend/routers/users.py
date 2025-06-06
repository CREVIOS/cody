from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import schema as schemas
import crud
from db import get_db
import models

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: schemas.UserCreate,
    db: AsyncSession = Depends(get_db)
):
    # Check if user already exists
    existing_user = await crud.crud_user.get_by_email(db, email=user_in.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    existing_username = await crud.crud_user.get_by_username(db, username=user_in.username)
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Create user with password hash
    user_data = user_in.model_dump()
    password = user_data.pop('password')  # Remove password from data
    user_data['password_hash'] = password  # Store password as hash (should use proper hashing in production)
    
    return await crud.crud_user.create(db, obj_in=user_data)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.User])
async def read_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if status_filter:
        filters["status"] = status_filter
    
    users = await crud.crud_user.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_user.count(db, **filters)
    
    return schemas.PaginatedResponse[schemas.User](
        items=users,
        total=total,
        page=skip // limit + 1,
        size=len(users),
        pages=(total + limit - 1) // limit
    )

@router.get("/{user_id}", response_model=schemas.User)
async def read_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    user = await crud.crud_user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user

@router.put("/{user_id}", response_model=schemas.User)
async def update_user(
    user_id: UUID,
    user_update: schemas.UserUpdate,
    db: AsyncSession = Depends(get_db)
):
    user = await crud.crud_user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return await crud.crud_user.update(db, db_obj=user, obj_in=user_update)

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    user = await crud.crud_user.remove(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        



@router.get("/{user_id}/all-projects", response_model=schemas.UserProjectsResponse)
async def get_user_all_projects(
    user_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get all projects where user is owner or member"""
    # Verify user exists
    user = await crud.crud_user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Get owned projects
    owned_projects = await crud.crud_project.get_by_owner(db, owner_id=user_id)
    
    # Get projects where user is a member
    from sqlalchemy import select, and_
    from sqlalchemy.orm import selectinload
    
    # Query for member projects
    result = await db.execute(
        select(models.Project)
        .join(models.ProjectMember, models.Project.project_id == models.ProjectMember.project_id)
        .join(models.Role, models.ProjectMember.role_id == models.Role.role_id)
        .where(
            and_(
                models.ProjectMember.user_id == user_id,
                models.ProjectMember.is_active == True,
                models.Project.is_active == True,
                models.Project.owner_id != user_id  # Exclude owned projects
            )
        )
        .options(
            selectinload(models.Project.owner),
            selectinload(models.Project.members).selectinload(models.ProjectMember.role)
        )
    )
    member_projects = result.scalars().all()
    
    # Get member roles
    member_projects_with_roles = []
    for project in member_projects:
        # Find this user's role in the project
        user_member = next(
            (m for m in project.members if m.user_id == user_id),
            None
        )
        if user_member:
            member_projects_with_roles.append({
                "project": project,
                "role": user_member.role.role_name
            })
    
    return schemas.UserProjectsResponse(
        user=user,
        owned_projects=owned_projects,
        member_projects=member_projects_with_roles
    )