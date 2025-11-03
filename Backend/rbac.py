from __future__ import annotations
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import models

OWNER = "owner"
EDITOR = "editor"
VIEWER = "viewer"

async def _role_for_user(db: AsyncSession, project_id: UUID, user_id: UUID) -> str | None:
    """Return role name or None if user not in project."""
    if not project_id or not user_id:
        return None

    # Check if owner
    project_owner = (
        await db.execute(select(models.Project.owner_id).where(models.Project.project_id == project_id))
    ).scalar_one_or_none()
    if project_owner and project_owner == user_id:
        return OWNER

    # Otherwise get member role
    role = (
        await db.execute(
            select(models.Role.role_name)
            .join(models.ProjectMember, models.ProjectMember.role_id == models.Role.role_id)
            .where(
                models.ProjectMember.project_id == project_id,
                models.ProjectMember.user_id == user_id,
                models.ProjectMember.is_active == True,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return role


async def ensure_can_view_project(db: AsyncSession, project_id: UUID, user_id: UUID) -> None:
    role = await _role_for_user(db, project_id, user_id)
    if not role:
        raise PermissionError("Not a member of this project.")


async def ensure_can_request_lock(db: AsyncSession, project_id: UUID, user_id: UUID) -> None:
    role = await _role_for_user(db, project_id, user_id)
    if role in (OWNER, EDITOR):
        return
    raise PermissionError("Only owners or editors can request locks.")


async def ensure_can_preempt(db: AsyncSession, project_id: UUID, user_id: UUID) -> None:
    role = await _role_for_user(db, project_id, user_id)
    if role == OWNER:
        return
    raise PermissionError("Only owner can preempt or transfer locks.")
