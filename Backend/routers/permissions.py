from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

import crud
from db import get_db
import schema as schemas
from services.permissions_chain import permission_chain, KNOWN_PERMISSIONS


router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get(
    "/projects/{project_id}",
    response_model=schemas.UserProjectPermissions,
    summary="Get computed permissions for a user within a project",
)
async def get_user_project_permissions(
    project_id: UUID,
    user_id: UUID = Query(..., description="User ID to compute permissions for"),
    db: AsyncSession = Depends(get_db),
):
    member = await crud.crud_project_member.get_by_project_and_user(db, project_id=project_id, user_id=user_id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this project",
        )

    role = await crud.crud_role.get(db, id=member.role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    # Compute permissions using the backend chain of responsibility
    computed = permission_chain.compute_permissions_map(
        role_name=role.role_name,
        role_permissions=role.permissions or {},
        permissions=KNOWN_PERMISSIONS,
        context={"project_id": str(project_id), "user_id": str(user_id)},
    )

    return schemas.UserProjectPermissions(
        project_id=project_id,
        user_id=user_id,
        role_id=role.role_id,
        role_name=role.role_name,
        permissions=computed,
    )


