"""
Permission Enforcer using Strategy Pattern

This module provides the main interface for evaluating user permissions
using the Strategy pattern. It replaces the previous Chain of Responsibility
approach with a more appropriate Strategy-based system.
"""

from typing import Any, Dict, Optional
from uuid import UUID
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

import crud
from services.permission_strategies import (
    create_permission_evaluator,
    PermissionContext
)


@dataclass
class PermissionResult:
    """Result of a permission evaluation."""
    granted: bool
    reason: Optional[str] = None
    handled_by: Optional[str] = None


async def evaluate_user_permission(
    db: AsyncSession,
    *,
    project_id: UUID,
    user_id: UUID,
    permission: str,
    context: Optional[Dict[str, Any]] = None,
) -> PermissionResult:
    """
    Evaluate a user's permission within a project using the Strategy pattern.

    This function:
    1. Fetches the user's role in the project
    2. Creates the appropriate permission strategy for that role
    3. Delegates the permission check to the strategy

    Args:
        db: Database session
        project_id: ID of the project
        user_id: ID of the user
        permission: Permission to check (e.g., "canEdit")
        context: Additional context for permission evaluation

    Returns:
        PermissionResult with granted status and reason
    """
    # Check if user is project owner first
    project = await crud.crud_project.get(db, id=project_id)
    if not project:
        return PermissionResult(False, reason="Project not found")
    
    if project.owner_id == user_id:
        # Project owners always use the owner strategy
        evaluator = create_permission_evaluator("owner")
        permission_context = PermissionContext(
            project_id=str(project_id),
            user_id=str(user_id),
            additional_data=context
        )
        
        granted = evaluator.has_permission(permission, permission_context)
        return PermissionResult(
            granted=granted,
            reason=f"Project owner {'has' if granted else 'does not have'} {permission} permission",
            handled_by="OwnerPermissionStrategy"
        )

    # Check if user is a project member
    member = await crud.crud_project_member.get_by_project_and_user(
        db, project_id=project_id, user_id=user_id
    )
    if not member:
        return PermissionResult(False, reason="User is not a member of this project")

    # Get the user's role
    role = await crud.crud_role.get(db, id=member.role_id)
    if not role:
        return PermissionResult(False, reason="Role not found for user")

    # Create the appropriate permission strategy for the role
    evaluator = create_permission_evaluator(
        role_name=role.role_name,
        role_permissions=role.permissions
    )
    
    # Create permission context
    permission_context = PermissionContext(
        project_id=str(project_id),
        user_id=str(user_id),
        additional_data=context
    )
    
    # Evaluate the permission using the strategy
    granted = evaluator.has_permission(permission, permission_context)
    
    return PermissionResult(
        granted=granted,
        reason=f"Role '{role.role_name}' {'has' if granted else 'does not have'} {permission} permission",
        handled_by=f"{evaluator.get_role_name().title()}PermissionStrategy"
    )


async def get_user_permissions_map(
    db: AsyncSession,
    *,
    project_id: UUID,
    user_id: UUID,
    permissions_to_check: Optional[list] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, bool]:
    """
    Get a complete map of permissions for a user in a project.
    
    This is more efficient than checking permissions one by one,
    as it uses the strategy's get_permissions_map method.
    
    Args:
        db: Database session
        project_id: ID of the project
        user_id: ID of the user
        permissions_to_check: List of specific permissions to check
        context: Additional context for permission evaluation
        
    Returns:
        Dictionary mapping permission names to boolean granted status
    """
    # Check if user is project owner first
    project = await crud.crud_project.get(db, id=project_id)
    if not project:
        return {}
    
    permission_context = PermissionContext(
        project_id=str(project_id),
        user_id=str(user_id),
        additional_data=context
    )
    
    if project.owner_id == user_id:
        # Project owners always use the owner strategy
        evaluator = create_permission_evaluator("owner")
        permissions_set = set(permissions_to_check) if permissions_to_check else None
        return evaluator.get_permissions_map(permission_context, permissions_set)

    # Check if user is a project member
    member = await crud.crud_project_member.get_by_project_and_user(
        db, project_id=project_id, user_id=user_id
    )
    if not member:
        # User is not a member, return all False
        default_permissions = [
            "canEdit", "canLock", "canView", "canInvite", "canApproveLock",
            "canRequestLock", "canDeleteProject", "canManageMembers"
        ]
        check_permissions = permissions_to_check or default_permissions
        return {perm: False for perm in check_permissions}

    # Get the user's role
    role = await crud.crud_role.get(db, id=member.role_id)
    if not role:
        # Role not found, return all False
        default_permissions = [
            "canEdit", "canLock", "canView", "canInvite", "canApproveLock",
            "canRequestLock", "canDeleteProject", "canManageMembers"
        ]
        check_permissions = permissions_to_check or default_permissions
        return {perm: False for perm in check_permissions}

    # Create the appropriate permission strategy for the role
    evaluator = create_permission_evaluator(
        role_name=role.role_name,
        role_permissions=role.permissions
    )
    
    # Get permissions map using the strategy
    permissions_set = set(permissions_to_check) if permissions_to_check else None
    return evaluator.get_permissions_map(permission_context, permissions_set)


