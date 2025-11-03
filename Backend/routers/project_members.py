from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
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

# NOTE: Return plain JSON dicts to avoid response_model validation issues when adding a virtual owner entry.
@router.get("/by-project/{project_id}")
async def get_project_members_with_details(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get all members of a specific project with full user and role details as uniform JSON."""
    from sqlalchemy.orm import selectinload

    # Verify project exists and load owner relation
    project_result = await db.execute(
        select(crud.crud_project.model)
        .where(crud.crud_project.model.project_id == project_id)
        .options(selectinload(crud.crud_project.model.owner))
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Load active members with relations
    result = await db.execute(
        select(crud.crud_project_member.model)
        .where(crud.crud_project_member.model.project_id == project_id)
        .where(crud.crud_project_member.model.is_active == True)
        .options(
            selectinload(crud.crud_project_member.model.user),
            selectinload(crud.crud_project_member.model.role),
            selectinload(crud.crud_project_member.model.inviter),
        )
    )
    rows = result.scalars().all()

    # Build a uniform JSON list
    def to_str(v):
        return str(v) if v is not None else None

    out = []
    for m in rows:
        out.append({
            "project_member_id": to_str(getattr(m, "project_member_id", None)),
            "project_id": to_str(getattr(m, "project_id", None)),
            "user_id": to_str(getattr(m, "user_id", None)),
            "role_id": to_str(getattr(m, "role_id", None)),
            "invited_by": to_str(getattr(m, "invited_by", None)),
            "joined_at": (getattr(m, "created_at", None).isoformat()
                          if getattr(m, "created_at", None) else None),
            "last_activity": (getattr(m, "last_activity", None).isoformat()
                              if getattr(m, "last_activity", None) else None),
            "is_active": bool(getattr(m, "is_active", True)),
            "user": ({
                "user_id": to_str(getattr(m.user, "user_id", None)),
                "name": getattr(m.user, "name", None),
                "email": getattr(m.user, "email", None),
                "avatar_url": getattr(m.user, "avatar_url", None),
            } if getattr(m, "user", None) else None),
            "role": ({
                "role_id": to_str(getattr(m.role, "role_id", None)),
                "role_name": getattr(m.role, "role_name", None),
                "permissions": getattr(m.role, "permissions", None),
            } if getattr(m, "role", None) else None),
            "inviter": ({
                "user_id": to_str(getattr(m.inviter, "user_id", None)),
                "name": getattr(m.inviter, "name", None),
                "email": getattr(m.inviter, "email", None),
            } if getattr(m, "inviter", None) else None),
            "is_owner": False,
        })

    # Ensure owner is first; add virtual entry if missing
    owner_in_list = any(item["user_id"] == to_str(project.owner_id) for item in out)
    if not owner_in_list:
        # Find "Owner" role (case-insensitive); optional
        owner_role_result = await db.execute(
            select(crud.crud_role.model).where(crud.crud_role.model.role_name.ilike("owner"))
        )
        owner_role = owner_role_result.scalar_one_or_none()

        out_owner = {
            "project_member_id": None,  # no fabricated UUID to avoid type issues
            "project_id": to_str(project_id),
            "user_id": to_str(project.owner_id),
            "role_id": to_str(getattr(owner_role, "role_id", None)),
            "invited_by": None,
            "joined_at": (project.created_at.isoformat()
                          if getattr(project, "created_at", None) else None),
            "last_activity": None,
            "is_active": True,
            "user": ({
                "user_id": to_str(getattr(project.owner, "user_id", None)),
                "name": getattr(project.owner, "name", None),
                "email": getattr(project.owner, "email", None),
                "avatar_url": getattr(project.owner, "avatar_url", None),
            } if getattr(project, "owner", None) else None),
            "role": ({
                "role_id": to_str(getattr(owner_role, "role_id", None)),
                "role_name": getattr(owner_role, "role_name", "Owner"),
                "permissions": getattr(owner_role, "permissions", None),
            } if owner_role else {
                "role_id": None,
                "role_name": "Owner",
                "permissions": None,
            }),
            "inviter": None,
            "is_owner": True,
        }
        out = [out_owner] + out

    return out
