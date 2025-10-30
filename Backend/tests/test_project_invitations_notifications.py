import time
from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def create_user(client: AsyncClient, suffix: str):
    response = await client.post(
        "/api/v1/users/",
        json={
            "username": f"user_{suffix}",
            "email": f"user_{suffix}@example.com",
            "password": "password123",
        },
    )
    assert response.status_code == 201
    return response.json()


async def create_role(client: AsyncClient, name: str):
    response = await client.post(
        "/api/v1/roles/",
        json={
            "role_name": name,
            "description": f"{name} role",
            "permissions": ["invite"],
        },
    )
    assert response.status_code == 201
    return response.json()


async def create_project(client: AsyncClient, owner_id: str, suffix: str):
    response = await client.post(
        "/api/v1/projects/",
        json={
            "project_name": f"Project {suffix}",
            "description": "Test project for invitations",
            "owner_id": owner_id,
        },
    )
    assert response.status_code == 201
    return response.json()


async def send_invitation(
    client: AsyncClient,
    project_id: str,
    email: str,
    role_id: str,
    invited_by: str,
    user_id: str,
):
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    response = await client.post(
        "/api/v1/project-invitations/",
        json={
            "project_id": project_id,
            "email": email,
            "role_id": role_id,
            "invited_by": invited_by,
            "user_id": user_id,
            "expires_at": expires_at,
        },
    )
    assert response.status_code == 201
    return response.json()


async def fetch_notifications(client: AsyncClient, user_id: str):
    response = await client.get(
        f"/api/v1/notifications/?user_id={user_id}"
    )
    assert response.status_code == 200
    return response.json()


async def test_invitation_creates_notification_and_updates_on_accept(client: AsyncClient):
    suffix = str(int(time.time() * 1000))
    owner = await create_user(client, f"owner_{suffix}")
    invitee = await create_user(client, f"invitee_{suffix}")
    role = await create_role(client, f"Contributor_{suffix}")
    project = await create_project(client, owner["user_id"], suffix)

    invitation = await send_invitation(
        client=client,
        project_id=project["project_id"],
        email=invitee["email"],
        role_id=role["role_id"],
        invited_by=owner["user_id"],
        user_id=invitee["user_id"],
    )
    assert invitation["user_id"] == invitee["user_id"]

    notifications_payload = await fetch_notifications(client, invitee["user_id"])
    assert notifications_payload["total"] == 1
    notification = notifications_payload["items"][0]
    assert notification["notification_type"] == "invitation"
    assert notification["is_read"] is False
    assert notification["reference_id"] == invitation["invitation_id"]
    assert notification["payload"]["status"] == "pending"
    assert notification["payload"]["project_id"] == project["project_id"]

    # Accept the invitation
    accept_response = await client.post(
        f"/api/v1/project-invitations/{invitation['invitation_id']}/accept",
        json={"user_id": invitee["user_id"]},
    )
    assert accept_response.status_code == 200

    # Notification should now be marked as read and status updated
    notifications_after = await fetch_notifications(client, invitee["user_id"])
    assert notifications_after["total"] == 1
    updated_notification = notifications_after["items"][0]
    assert updated_notification["is_read"] is True
    assert updated_notification["payload"]["status"] == "accepted"
    assert "responded_at" in updated_notification["payload"]

    # Ensure the invitee is now a project member
    members_response = await client.get(
        f"/api/v1/project-members/?project_id={project['project_id']}"
    )
    assert members_response.status_code == 200
    members_payload = members_response.json()
    member_ids = {member["user_id"] for member in members_payload["items"]}
    assert invitee["user_id"] in member_ids
