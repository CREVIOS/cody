"""
Decorator Pattern for Permission Checks

This module implements the Decorator pattern to handle permission checks
in API routes. Instead of repeating permission validation logic in each
route handler, we use decorators to wrap the functionality.

Design Pattern: Decorator
Purpose: Add permission checking behavior to route handlers without modifying their core logic
Benefits:
    - DRY principle: Eliminates repetitive permission check code
    - Separation of concerns: Permission logic is decoupled from business logic
    - Reusability: Same decorator can be used across multiple routes
    - Maintainability: Changes to permission logic only need to be made in one place
"""

from functools import wraps
from typing import Callable, Optional, Any
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from services.permission_enforcer import evaluate_user_permission


class PermissionDecorator:
    """
    Decorator class that wraps route handlers to enforce permissions.

    This is the core of the Decorator pattern - it wraps the original
    function (component) and adds additional behavior (permission checking)
    without modifying the original function.
    """

    def __init__(
        self,
        permission: str,
        get_project_id: Optional[Callable] = None,
        get_user_id: Optional[Callable] = None,
        project_id_param: str = "project_id",
        user_id_param: str = "actor_id"
    ):
        """
        Initialize the permission decorator.

        Args:
            permission: The permission to check (e.g., "canEdit", "canDeleteProject")
            get_project_id: Optional callable to extract project_id from route params
            get_user_id: Optional callable to extract user_id from route params
            project_id_param: Name of the parameter containing project_id (default: "project_id")
            user_id_param: Name of the parameter containing user_id (default: "actor_id")
        """
        self.permission = permission
        self.get_project_id = get_project_id
        self.get_user_id = get_user_id
        self.project_id_param = project_id_param
        self.user_id_param = user_id_param

    def __call__(self, func: Callable) -> Callable:
        """
        The decorator implementation. This wraps the original function
        with permission checking logic.
        """
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract database session
            db: AsyncSession = kwargs.get("db")
            if not db:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database session not found"
                )

            # Extract or compute project_id
            if self.get_project_id:
                project_id = await self.get_project_id(*args, **kwargs)
            else:
                project_id = kwargs.get(self.project_id_param)

            if not project_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing {self.project_id_param}"
                )

            # Extract or compute user_id
            if self.get_user_id:
                user_id = await self.get_user_id(*args, **kwargs)
            else:
                user_id = kwargs.get(self.user_id_param)

            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing {self.user_id_param}"
                )

            # Perform permission check
            permission_eval = await evaluate_user_permission(
                db,
                project_id=project_id,
                user_id=user_id,
                permission=self.permission,
            )

            if not permission_eval.granted:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=permission_eval.reason or f"User lacks {self.permission} permission",
                )

            # If permission check passes, call the original function
            return await func(*args, **kwargs)

        return wrapper


def require_permission(
    permission: str,
    get_project_id: Optional[Callable] = None,
    get_user_id: Optional[Callable] = None,
    project_id_param: str = "project_id",
    user_id_param: str = "actor_id"
):
    """
    Convenience function to create a permission decorator.

    Usage:
        @require_permission("canEdit")
        async def update_file(file_id: UUID, actor_id: UUID, db: AsyncSession, ...):
            # This function only executes if the user has canEdit permission
            ...

        @require_permission("canEdit", get_project_id=get_file_project_id)
        async def update_file(file_id: UUID, actor_id: UUID, db: AsyncSession, ...):
            # Uses custom function to extract project_id from file_id
            ...

    Args:
        permission: The permission to check
        get_project_id: Optional async callable to extract project_id
        get_user_id: Optional async callable to extract user_id
        project_id_param: Name of parameter containing project_id
        user_id_param: Name of parameter containing user_id

    Returns:
        PermissionDecorator instance that can wrap route handlers
    """
    return PermissionDecorator(
        permission=permission,
        get_project_id=get_project_id,
        get_user_id=get_user_id,
        project_id_param=project_id_param,
        user_id_param=user_id_param
    )


# Additional decorator for resource-level permissions
class ResourcePermissionDecorator:
    """
    Decorator for checking permissions on specific resources (files, projects, etc.)

    This extends the basic permission decorator to handle resource-specific
    permission checks, where we need to fetch the resource first to determine
    the project context.
    """

    def __init__(
        self,
        permission: str,
        resource_type: str,
        resource_id_param: str = "id",
        user_id_param: str = "actor_id"
    ):
        """
        Args:
            permission: Permission to check
            resource_type: Type of resource ("file", "directory", etc.)
            resource_id_param: Parameter name containing resource ID
            user_id_param: Parameter name containing user ID
        """
        self.permission = permission
        self.resource_type = resource_type
        self.resource_id_param = resource_id_param
        self.user_id_param = user_id_param

    def __call__(self, func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            import crud

            db: AsyncSession = kwargs.get("db")
            if not db:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database session not found"
                )

            resource_id = kwargs.get(self.resource_id_param)
            user_id = kwargs.get(self.user_id_param)

            if not resource_id or not user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing {self.resource_id_param} or {self.user_id_param}"
                )

            # Fetch resource to get project context
            crud_instance = getattr(crud, f"crud_{self.resource_type}", None)
            if not crud_instance:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Unknown resource type: {self.resource_type}"
                )

            resource = await crud_instance.get(db, id=resource_id)
            if not resource:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"{self.resource_type.capitalize()} not found"
                )

            # Get project_id from resource
            project_id = getattr(resource, "project_id", None)
            if not project_id:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Resource does not have project_id"
                )

            # Check permission
            permission_eval = await evaluate_user_permission(
                db,
                project_id=project_id,
                user_id=user_id,
                permission=self.permission,
            )

            if not permission_eval.granted:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=permission_eval.reason or f"User lacks {self.permission} permission",
                )

            return await func(*args, **kwargs)

        return wrapper


def require_resource_permission(
    permission: str,
    resource_type: str,
    resource_id_param: str = "id",
    user_id_param: str = "actor_id"
):
    """
    Decorator for resource-level permission checks.

    Usage:
        @require_resource_permission("canEdit", resource_type="file", resource_id_param="file_id")
        async def update_file(file_id: UUID, actor_id: UUID, db: AsyncSession, ...):
            # Permission is checked against the file's project
            ...
    """
    return ResourcePermissionDecorator(
        permission=permission,
        resource_type=resource_type,
        resource_id_param=resource_id_param,
        user_id_param=user_id_param
    )
