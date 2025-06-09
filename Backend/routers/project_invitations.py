from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone
import secrets
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/project-invitations", tags=["project-invitations"])

@router.post("/", response_model=schemas.ProjectInvitation, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    invitation_in: schemas.ProjectInvitationCreate,
    db: AsyncSession = Depends(get_db)
):
    # Verify project exists
    project = await crud.crud_project.get(db, id=invitation_in.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Verify role exists
    role = await crud.crud_role.get(db, id=invitation_in.role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found"
        )
    
    # Verify inviter exists
    inviter = await crud.crud_user.get(db, id=invitation_in.invited_by)
    if not inviter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inviter not found"
        )
    
    # Check if user is already a member
    if invitation_in.user_id:
        existing_member = await crud.crud_project_member.get_by_project_and_user(
            db, project_id=invitation_in.project_id, user_id=invitation_in.user_id
        )
        if existing_member:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already a member of this project"
            )
    
    # Check for existing pending invitation
    existing_invitation = await crud.crud_project_invitation.get_by_email_and_project(
        db, email=invitation_in.email, project_id=invitation_in.project_id
    )
    if existing_invitation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pending invitation already exists for this email and project"
        )
    
    invitation = await crud.crud_project_invitation.create(db, obj_in=invitation_in)
    
    return invitation

@router.get("/", response_model=schemas.PaginatedResponse[schemas.ProjectInvitation])
async def read_invitations(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    project_id: Optional[UUID] = None,
    email: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    filters = {}
    if project_id:
        filters["project_id"] = project_id
    if email:
        filters["email"] = email
    if status:
        filters["status"] = status
    
    invitations = await crud.crud_project_invitation.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_project_invitation.count(db, **filters)
    
    return schemas.PaginatedResponse[schemas.ProjectInvitation](
        items=invitations,
        total=total,
        page=skip // limit + 1,
        size=len(invitations),
        pages=(total + limit - 1) // limit
    )


@router.get("/{invitation_id}", response_model=schemas.ProjectInvitation)
async def read_invitation(
    invitation_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    invitation = await crud.crud_project_invitation.get(db, id=invitation_id)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
    return invitation

@router.get("/token/{token}", response_model=schemas.ProjectInvitation)
async def get_invitation_by_token(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    invitation = await crud.crud_project_invitation.get_by_token(db, token=token)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
    
    # Check if invitation has expired
    if invitation.expires_at < datetime.now(timezone.utc):
        # Update status to expired
        await crud.crud_project_invitation.update(
            db, 
            db_obj=invitation, 
            obj_in=schemas.ProjectInvitationUpdate(status="expired")
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation has expired"
        )
    
    return invitation

@router.post("/{invitation_id}/accept", response_model=schemas.ProjectMember)
async def accept_invitation(
    invitation_id: UUID,
    accept_data: schemas.AcceptInvitationRequest,
    db: AsyncSession = Depends(get_db)
):
    user_id = accept_data.user_id
    
    invitation = await crud.crud_project_invitation.get(db, id=invitation_id)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
    
    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation is not pending"
        )
    
    # Check if invitation has expired
    if invitation.expires_at < datetime.now(timezone.utc):
        await crud.crud_project_invitation.update(
            db, 
            db_obj=invitation, 
            obj_in=schemas.ProjectInvitationUpdate(status="expired")
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation has expired"
        )
    
    # Verify user exists
    user = await crud.crud_user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if user email matches invitation email
    if user.email != invitation.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User email does not match invitation email"
        )
    
    # Check if user is already a member
    existing_member = await crud.crud_project_member.get_by_project_and_user(
        db, project_id=invitation.project_id, user_id=user_id
    )
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member of this project"
        )
    
    # Create project member
    member_data = schemas.ProjectMemberCreate(
        project_id=invitation.project_id,
        user_id=user_id,
        role_id=invitation.role_id,
        invited_by=invitation.invited_by
    )
    member = await crud.crud_project_member.create(db, obj_in=member_data)
    
    # Delete the invitation after successfully creating member
    await crud.crud_project_invitation.remove(db, id=invitation_id)
    
    return member

@router.post("/{invitation_id}/decline", response_model=schemas.ProjectInvitation)
async def decline_invitation(
    invitation_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    invitation = await crud.crud_project_invitation.get(db, id=invitation_id)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
    
    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation is not pending"
        )
    
    return await crud.crud_project_invitation.update(
        db,
        db_obj=invitation,
        obj_in=schemas.ProjectInvitationUpdate(status="declined")
    )

@router.put("/{invitation_id}", response_model=schemas.ProjectInvitation)
async def update_invitation(
    invitation_id: UUID,
    invitation_update: schemas.ProjectInvitationUpdate,
    db: AsyncSession = Depends(get_db)
):
    invitation = await crud.crud_project_invitation.get(db, id=invitation_id)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
    
    return await crud.crud_project_invitation.update(db, db_obj=invitation, obj_in=invitation_update)

@router.delete("/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invitation(
    invitation_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    invitation = await crud.crud_project_invitation.remove(db, id=invitation_id)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )

@router.get("/by-email/{email}", response_model=List[schemas.ProjectInvitationWithDetails])
async def get_invitations_by_email(
    email: str,
    db: AsyncSession = Depends(get_db)
):
    """Get pending invitations for a user by email with full details"""
    invitations = await crud.crud_project_invitation.get_pending_by_email(db, email=email)
    
    detailed_invitations = []
    for invitation in invitations:
        # Use preloaded relationships (more efficient)
        if invitation.project and invitation.role and invitation.inviter:
            # Create a proper detailed invitation object
            detailed_invitation = schemas.ProjectInvitationWithDetails(
                invitation_id=invitation.invitation_id,
                project_id=invitation.project_id,
                email=invitation.email,
                role_id=invitation.role_id,
                user_id=invitation.user_id,
                expires_at=invitation.expires_at,
                invited_by=invitation.invited_by,
                token=invitation.token,
                status=invitation.status,
                created_at=invitation.created_at,
                accepted_at=invitation.accepted_at,
                project=invitation.project,
                role=invitation.role,
                inviter=invitation.inviter
            )
            detailed_invitations.append(detailed_invitation)
    
    return detailed_invitations
