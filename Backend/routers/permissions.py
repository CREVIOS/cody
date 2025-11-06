"""
Permissions API Router using Strategy Pattern

This router provides endpoints for querying user permissions within projects.
It uses the Strategy pattern to determine permissions based on user roles.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

import crud
from db import get_db
import schema as schemas
from services.permission_enforcer import get_user_permissions_map


router = APIRouter(prefix="/permissions", tags=["permissions"])

# Known permissions in the system
KNOWN_PERMISSIONS = [
    "canEdit",
    "canLock",
    "canView",
    "canInvite",
    "canApproveLock",
    "canRequestLock",
    "canDeleteProject",
    "canManageMembers",
]


@router.get(
    "/projects/{project_id}",
    response_model=schemas.UserProjectPermissions,
    summary="Get computed permissions for a user within a project using Strategy pattern",
)
async def get_user_project_permissions(
    project_id: UUID,
    user_id: UUID = Query(..., description="User ID to compute permissions for"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all permissions for a user in a specific project.
    
    This endpoint uses the Strategy pattern to determine permissions:
    1. Identifies the user's role in the project
    2. Creates the appropriate permission strategy for that role
    3. Computes all permissions using the strategy
    
    The Strategy pattern ensures:
    - Each role encapsulates its own permission logic
    - Easy to add new roles without modifying existing code
    - Runtime role changes are supported
    - Clear separation of concerns
    """
    # Verify project exists
    project = await crud.crud_project.get(db, id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check if user is project owner
    if project.owner_id == user_id:
        # Use Strategy pattern to get owner permissions
        permissions_map = await get_user_permissions_map(
            db,
            project_id=project_id,
            user_id=user_id,
            permissions_to_check=KNOWN_PERMISSIONS
        )
        
        return schemas.UserProjectPermissions(
            project_id=project_id,
            user_id=user_id,
            role_id=None,  # Owners don't have a role_id in project_members
            role_name="owner",
            permissions=permissions_map,
        )
    
    # Check if user is a project member
    member = await crud.crud_project_member.get_by_project_and_user(
        db, project_id=project_id, user_id=user_id
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this project",
        )

    role = await crud.crud_role.get(db, id=member.role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Role not found"
        )

    # Use Strategy pattern to compute permissions efficiently
    permissions_map = await get_user_permissions_map(
        db,
        project_id=project_id,
        user_id=user_id,
        permissions_to_check=KNOWN_PERMISSIONS,
        context={"member_id": str(member.project_member_id)}
    )

    return schemas.UserProjectPermissions(
        project_id=project_id,
        user_id=user_id,
        role_id=role.role_id,
        role_name=role.role_name,
        permissions=permissions_map,
    )


@router.get(
    "/projects/{project_id}/check",
    summary="Check a specific permission for a user in a project",
)
async def check_user_permission(
    project_id: UUID,
    permission: str = Query(..., description="Permission to check (e.g., 'canEdit')"),
    user_id: UUID = Query(..., description="User ID to check permission for"),
    db: AsyncSession = Depends(get_db),
):
    """
    Check a specific permission for a user in a project.
    
    This is a convenience endpoint for checking individual permissions
    using the Strategy pattern.
    """
    from services.permission_enforcer import evaluate_user_permission
    
    # Validate permission name
    if permission not in KNOWN_PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission: {permission}. Valid permissions: {', '.join(KNOWN_PERMISSIONS)}"
        )
    
    # Use Strategy pattern to evaluate the permission
    result = await evaluate_user_permission(
        db,
        project_id=project_id,
        user_id=user_id,
        permission=permission
    )
    
    return {
        "project_id": project_id,
        "user_id": user_id,
        "permission": permission,
        "granted": result.granted,
        "reason": result.reason,
        "handled_by": result.handled_by
    }


