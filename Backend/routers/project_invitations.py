from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone
<<<<<<< HEAD
import secrets
=======
>>>>>>> main
import schema as schemas
import crud
from db import get_db

router = APIRouter(prefix="/project-invitations", tags=["project-invitations"])

@router.post("/", response_model=schemas.ProjectInvitation, status_code=status.HTTP_201_CREATED)
<<<<<<< HEAD
async def create_invitation(
    invitation_in: schemas.ProjectInvitationCreate,
    db: AsyncSession = Depends(get_db)
):
=======
async def create_project_invitation(
    invitation_in: schemas.ProjectInvitationCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new project invitation"""
>>>>>>> main
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
<<<<<<< HEAD
            detail="Inviter not found"
        )
    
    # Check if user is already a member
=======
            detail="Inviter user not found"
        )
    
    # Check if user is already a member of the project (if user_id provided)
>>>>>>> main
    if invitation_in.user_id:
        existing_member = await crud.crud_project_member.get_by_project_and_user(
            db, project_id=invitation_in.project_id, user_id=invitation_in.user_id
        )
        if existing_member:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already a member of this project"
            )
    
<<<<<<< HEAD
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
=======
    # Check for existing pending invitation to the same email for the same project
    existing_invitations = await crud.get_invitations_by_project(db, invitation_in.project_id)
    for inv in existing_invitations:
        if inv.email == invitation_in.email and inv.status == 'pending':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pending invitation already exists for this email in this project"
            )
    
    return await crud.create_project_invitation(db, invitation_in)

@router.get("/", response_model=schemas.PaginatedResponse[schemas.ProjectInvitation])
async def read_project_invitations(
>>>>>>> main
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    project_id: Optional[UUID] = None,
    email: Optional[str] = None,
<<<<<<< HEAD
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
=======
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db)
):
    """Get project invitations with optional filtering"""
>>>>>>> main
    filters = {}
    if project_id:
        filters["project_id"] = project_id
    if email:
        filters["email"] = email
<<<<<<< HEAD
    if status:
        filters["status"] = status
    
    invitations = await crud.crud_project_invitation.get_multi(db, skip=skip, limit=limit, **filters)
    total = await crud.crud_project_invitation.count(db, **filters)
=======
    if status_filter:
        filters["status"] = status_filter
    
    invitations = await crud.get_multi_project_invitations(db, skip=skip, limit=limit, **filters)
    total = await crud.count_project_invitations(db, **filters)
>>>>>>> main
    
    return schemas.PaginatedResponse[schemas.ProjectInvitation](
        items=invitations,
        total=total,
        page=skip // limit + 1,
        size=len(invitations),
        pages=(total + limit - 1) // limit
    )

<<<<<<< HEAD

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
=======
@router.get("/by-email/{email}", response_model=List[schemas.ProjectInvitation])
async def read_invitations_by_email(
    email: str,
    pending_only: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """Get all invitations for a specific email address"""
    if pending_only:
        return await crud.get_pending_invitations_for_email(db, email=email)
    else:
        return await crud.get_invitations_by_email(db, email=email)

@router.get("/by-project/{project_id}", response_model=List[schemas.ProjectInvitation])
async def read_invitations_by_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get all invitations for a specific project"""
    # Verify project exists
    project = await crud.crud_project.get(db, id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return await crud.get_invitations_by_project(db, project_id=project_id)

@router.get("/by-token/{token}", response_model=schemas.ProjectInvitationWithDetails)
async def read_invitation_by_token(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """Get invitation details by token (used for invitation acceptance flow)"""
    invitation = await crud.get_project_invitation_by_token(db, token=token)
>>>>>>> main
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
    
    # Check if invitation has expired
    if invitation.expires_at < datetime.now(timezone.utc):
        # Update status to expired
<<<<<<< HEAD
        await crud.crud_project_invitation.update(
            db, 
            db_obj=invitation, 
            obj_in=schemas.ProjectInvitationUpdate(status="expired")
=======
        await crud.update_project_invitation(
            db, 
            invitation.invitation_id, 
            schemas.ProjectInvitationUpdate(status="expired")
>>>>>>> main
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation has expired"
        )
    
    return invitation

<<<<<<< HEAD
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
=======
@router.get("/{invitation_id}", response_model=schemas.ProjectInvitation)
async def read_project_invitation(
    invitation_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific project invitation by ID"""
    invitation = await crud.get_project_invitation(db, invitation_id)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project invitation not found"
        )
    return invitation

@router.put("/{invitation_id}", response_model=schemas.ProjectInvitation)
async def update_project_invitation(
    invitation_id: UUID,
    invitation_update: schemas.ProjectInvitationUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a project invitation"""
    invitation = await crud.get_project_invitation(db, invitation_id)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project invitation not found"
        )
    
    # If status is being changed to accepted, set accepted_at timestamp
    if invitation_update.status == "accepted" and not invitation_update.accepted_at:
        invitation_update.accepted_at = datetime.now(timezone.utc)
    
    return await crud.update_project_invitation(db, invitation_id, invitation_update)

@router.post("/{invitation_id}/accept", response_model=schemas.ProjectMember)
async def accept_project_invitation(
    invitation_id: UUID,
    accepting_user_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Accept a project invitation and create project membership"""
    invitation = await crud.get_project_invitation(db, invitation_id)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project invitation not found"
        )
    
    # Verify accepting user exists
    user = await crud.crud_user.get(db, id=accepting_user_id)
>>>>>>> main
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
<<<<<<< HEAD
=======
    # Check if invitation is still pending
    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invitation status is '{invitation.status}', cannot accept"
        )
    
    # Check if invitation has expired
    if invitation.expires_at < datetime.now(timezone.utc):
        await crud.update_project_invitation(
            db, 
            invitation_id, 
            schemas.ProjectInvitationUpdate(status="expired")
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation has expired"
        )
    
>>>>>>> main
    # Check if user email matches invitation email
    if user.email != invitation.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User email does not match invitation email"
        )
    
    # Check if user is already a member
    existing_member = await crud.crud_project_member.get_by_project_and_user(
<<<<<<< HEAD
        db, project_id=invitation.project_id, user_id=user_id
=======
        db, project_id=invitation.project_id, user_id=accepting_user_id
>>>>>>> main
    )
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member of this project"
        )
    
<<<<<<< HEAD
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
=======
    # Create project membership
    member_data = schemas.ProjectMemberCreate(
        project_id=invitation.project_id,
        user_id=accepting_user_id,
        role_id=invitation.role_id,
        invited_by=invitation.invited_by
    )
    
    # Create the membership
    new_member = await crud.crud_project_member.create(db, obj_in=member_data)
    
    # Update invitation status
    await crud.update_project_invitation(
        db,
        invitation_id,
        schemas.ProjectInvitationUpdate(
            status="accepted",
            user_id=accepting_user_id,
            accepted_at=datetime.now(timezone.utc)
        )
    )
    
    return new_member

@router.post("/{invitation_id}/decline", response_model=schemas.ProjectInvitation)
async def decline_project_invitation(
    invitation_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Decline a project invitation"""
    invitation = await crud.get_project_invitation(db, invitation_id)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project invitation not found"
>>>>>>> main
        )
    
    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
<<<<<<< HEAD
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
=======
            detail=f"Invitation status is '{invitation.status}', cannot decline"
        )
    
    return await crud.update_project_invitation(
        db,
        invitation_id,
        schemas.ProjectInvitationUpdate(status="declined")
    )

@router.delete("/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_invitation(
    invitation_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete a project invitation"""
    invitation = await crud.remove_project_invitation(db, invitation_id)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project invitation not found"
        ) 
>>>>>>> main
