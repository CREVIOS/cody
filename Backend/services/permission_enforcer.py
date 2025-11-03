from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

import crud
from services.permissions_chain import permission_chain, PermissionResult


async def evaluate_user_permission(
    db: AsyncSession,
    *,
    project_id: UUID,
    user_id: UUID,
    permission: str,
    context: Optional[Dict[str, Any]] = None,
):
    """Evaluate a user's permission within a project using the permission chain.

    Returns a PermissionResult-like object with .granted and .reason.
    """
    member = await crud.crud_project_member.get_by_project_and_user(
        db, project_id=project_id, user_id=user_id
    )
    if not member:
        return PermissionResult(False, reason="User is not a member of this project")

    role = await crud.crud_role.get(db, id=member.role_id)
    if not role:
        return PermissionResult(False, reason="Role not found for user")

    result = permission_chain.has_permission(
        permission=permission,
        role_name=role.role_name,
        role_permissions=role.permissions or {},
        context={"project_id": str(project_id), "user_id": str(user_id), **(context or {})},
    )
    return result


