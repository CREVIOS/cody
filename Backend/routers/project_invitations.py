import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone
import secrets
import schema as schemas
import crud
import models
from db import get_db
from services.permission_enforcer import evaluate_user_permission

router = APIRouter(prefix="/project-invitations", tags=["project-invitations"])

@router.post("/", response_model=schemas.ProjectInvitation, status_code=status.HTTP_201_CREATED)
async def create_project_invitation(
    invitation_in: schemas.ProjectInvitationCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new project invitation"""
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
            detail="Inviter user not found"
        )

    project_name = project.project_name
    role_name = role.role_name
    inviter_name = inviter.full_name or inviter.username or "Project member"

    
    # Permission: inviter must have canInvite for this project
    permission_eval = await evaluate_user_permission(
        db,
        project_id=invitation_in.project_id,
        user_id=invitation_in.invited_by,
        permission="canInvite",
    )
    if not permission_eval.granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=permission_eval.reason or "User lacks canInvite permission",
        )

    # Check if user is already a member of the project (if user_id provided)
    if invitation_in.user_id:
        existing_member = await crud.crud_project_member.get_by_project_and_user(
            db, project_id=invitation_in.project_id, user_id=invitation_in.user_id
        )
        if existing_member:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already a member of this project"
            )
    
    # Check for existing pending invitation to the same email for the same project
    existing_invitation = await crud.crud_project_invitation.get_by_email_and_project(
        db, email=invitation_in.email, project_id=invitation_in.project_id
    )
    if existing_invitation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pending invitation already exists for this email in this project"
        )
    
    invitation = await crud.create_project_invitation(db, invitation_in)

    # Create notification for the invited user if available
    try:
        await create_invitation_notification(
            db=db,
            invitation=invitation,
            project_name=project_name,
            role_name=role_name,
            inviter_name=inviter_name,
            inviter_id=invitation_in.invited_by,
        )
    except Exception:
        # Log but do not fail the request if notification creation fails
        logger = logging.getLogger(__name__)
        logger.exception("Failed to create invitation notification")

    # Refresh the invitation instance after additional commits
    await db.refresh(invitation)

    return invitation

@router.get("/", response_model=schemas.PaginatedResponse[schemas.ProjectInvitation])
async def read_project_invitations(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    project_id: Optional[UUID] = None,
    email: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db)
):
    """Get project invitations with optional filtering"""
    filters = {}
    if project_id:
        filters["project_id"] = project_id
    if email:
        filters["email"] = email
    if status_filter:
        filters["status"] = status_filter
    
    invitations = await crud.get_multi_project_invitations(db, skip=skip, limit=limit, **filters)
    total = await crud.count_project_invitations(db, **filters)
    
    return schemas.PaginatedResponse[schemas.ProjectInvitation](
        items=invitations,
        total=total,
        page=skip // limit + 1,
        size=len(invitations),
        pages=(total + limit - 1) // limit
    )

@router.get("/by-email/{email}", response_model=List[schemas.ProjectInvitationWithDetails])
async def read_invitations_by_email(
    email: str,
    pending_only: bool = Query(True),  # Default to pending only for notifications
    db: AsyncSession = Depends(get_db)
):
    """Get all invitations for a specific email address with full details"""
    if pending_only:
        invitations = await crud.get_pending_invitations_for_email(db, email=email)
    else:
        invitations = await crud.get_invitations_by_email(db, email=email)
    
    # Convert to detailed format (the CRUD functions already load the relationships)
    detailed_invitations = []
    for invitation in invitations:
        if invitation.project and invitation.role and invitation.inviter:
            detailed_invitations.append(invitation)
    
    return detailed_invitations

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
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
    
    # Check if invitation has expired
    if invitation.expires_at < datetime.now(timezone.utc):
        # Update status to expired
        await crud.update_project_invitation(
            db, 
            invitation.invitation_id, 
            schemas.ProjectInvitationUpdate(status="expired")
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation has expired"
        )
    
    return invitation

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
    accept_data: schemas.AcceptInvitationRequest,
    db: AsyncSession = Depends(get_db)
):
    """Accept a project invitation and create project membership"""
    accepting_user_id = accept_data.user_id
    
    invitation = await crud.get_project_invitation(db, invitation_id)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project invitation not found"
        )
    
    # Verify accepting user exists
    user = await crud.crud_user.get(db, id=accepting_user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if invitation is still pending
    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invitation status is '{invitation.status}', cannot accept"
        )
    
    # Check if invitation has expired
    expires_at = invitation.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        await crud.update_project_invitation(
            db, 
            invitation_id, 
            schemas.ProjectInvitationUpdate(status="expired")
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation has expired"
        )
    
    # Check if user email matches invitation email
    if user.email != invitation.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User email does not match invitation email"
        )
    
    # Check if user is already a member
    existing_member = await crud.crud_project_member.get_by_project_and_user(
        db, project_id=invitation.project_id, user_id=accepting_user_id
    )
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member of this project"
        )
    
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

    # Mark related notification as handled
    await update_invitation_notification_status(
        db,
        invitation_id=invitation.invitation_id,
        status="accepted",
        mark_read=True,
        responded_at=datetime.now(timezone.utc)
    )

    # Refresh member after subsequent commits to avoid expired attributes
    await db.refresh(new_member)
    
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
        )
    
    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invitation status is '{invitation.status}', cannot decline"
        )
    
    updated_invitation = await crud.update_project_invitation(
        db,
        invitation_id,
        schemas.ProjectInvitationUpdate(status="declined")
    )

    await update_invitation_notification_status(
        db,
        invitation_id=invitation_id,
        status="declined",
        mark_read=True,
        responded_at=datetime.now(timezone.utc)
    )

    return updated_invitation

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


async def create_invitation_notification(
    db: AsyncSession,
    invitation: models.ProjectInvitation,
    project_name: str,
    role_name: str,
    inviter_name: str,
    inviter_id: Optional[UUID],
):
    """Create or update a notification associated with a project invitation."""
    if not invitation.user_id:
        return None

    logger = logging.getLogger(__name__)
    logger.debug(
        "Creating invitation notification for user %s and invitation %s",
        invitation.user_id,
        invitation.invitation_id,
    )

    payload = {
        "category": "project_invitation",
        "invitation_id": str(invitation.invitation_id),
        "project_id": str(invitation.project_id) if invitation.project_id else None,
        "project_name": project_name,
        "role_id": str(invitation.role_id) if invitation.role_id else None,
        "role_name": role_name,
        "invited_by": str(inviter_id) if inviter_id else None,
        "invited_by_name": inviter_name,
        "expires_at": invitation.expires_at.isoformat() if invitation.expires_at else None,
        "status": invitation.status,
    }

    notification_in = schemas.NotificationCreate(
        user_id=invitation.user_id,
        project_id=invitation.project_id,
        notification_type="invitation",
        title=f"Invitation to join {project_name}",
        message=f"{inviter_name} invited you to join {project_name} as {role_name}.",
        reference_id=invitation.invitation_id,
        payload=payload,
        is_read=False,
    )

    # Ensure idempotency if a notification already exists for this invitation
    existing = await crud.crud_notification.get_multi(
        db, reference_id=invitation.invitation_id
    )
    if existing:
        notification = existing[0]
        update_data = schemas.NotificationUpdate(
            title=notification_in.title,
            message=notification_in.message,
            payload=payload,
            is_read=False,
        )
        await crud.crud_notification.update(
            db, db_obj=notification, obj_in=update_data
        )
        return notification

    return await crud.crud_notification.create(db, obj_in=notification_in)


async def update_invitation_notification_status(
    db: AsyncSession,
    invitation_id: UUID,
    status: str,
    mark_read: bool = True,
    responded_at: Optional[datetime] = None,
):
    """Update the notification payload/status when an invitation is accepted/declined."""
    notifications = await crud.crud_notification.get_multi(
        db, reference_id=invitation_id
    )
    if not notifications:
        logger = logging.getLogger(__name__)
        logger.warning(
            "No invitation notifications found for invitation %s", invitation_id
        )
        return

    for notification in notifications:
        payload = dict(notification.payload or {})
        payload["status"] = status
        if responded_at:
            payload["responded_at"] = responded_at.isoformat()

        update_payload = schemas.NotificationUpdate(
            payload=payload,
            is_read=mark_read,
        )
        logger = logging.getLogger(__name__)
        logger.debug(
            "Updating notification %s for invitation %s to status %s",
            notification.notification_id,
            invitation_id,
            status,
        )
        await crud.crud_notification.update(
            db, db_obj=notification, obj_in=update_payload
        )
