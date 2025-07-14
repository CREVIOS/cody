import pytest
from httpx import AsyncClient
import uuid
import time

# Mark all tests in this module as asyncio
pytestmark = pytest.mark.asyncio


async def test_create_user(client: AsyncClient):
    """
    Helper test to create a user for other tests.
    This is not a real test but a utility.
    In a real application, you might use fixtures to create test data.
    """
    # Use timestamp to make usernames and emails unique
    timestamp = str(int(time.time() * 1000))
    response = await client.post(
        "/api/v1/users/",
        json={
            "username": f"testuser_{timestamp}",
            "email": f"test_{timestamp}@example.com",
            "password": "password",
        },
    )
    assert response.status_code == 201
    user_data = response.json()
    assert user_data["username"] == f"testuser_{timestamp}"
    assert user_data["email"] == f"test_{timestamp}@example.com"
    return user_data


async def test_create_project(client: AsyncClient):
    # First, create a user to be the owner
    user = await test_create_user(client)
    owner_id = user["user_id"]

    response = await client.post(
        "/api/v1/projects/",
        json={
            "project_name": "Test Project",
            "description": "A test project",
            "owner_id": owner_id,
        },
    )
    assert response.status_code == 201
    project_data = response.json()
    assert project_data["project_name"] == "Test Project"
    assert project_data["owner_id"] == owner_id


async def test_create_project_with_invalid_owner(client: AsyncClient):
    invalid_owner_id = str(uuid.uuid4())
    response = await client.post(
        "/api/v1/projects/",
        json={
            "project_name": "Test Project Invalid Owner",
            "description": "A test project with an invalid owner",
            "owner_id": invalid_owner_id,
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Owner not found"


async def test_read_project(client: AsyncClient):
    # First, create a user and a project
    user = await test_create_user(client)
    owner_id = user["user_id"]
    response = await client.post(
        "/api/v1/projects/",
        json={
            "project_name": "Readable Project",
            "description": "A project to be read",
            "owner_id": owner_id,
        },
    )
    assert response.status_code == 201
    project_data = response.json()
    project_id = project_data["project_id"]

    # Now, read the project
    response = await client.get(f"/api/v1/projects/{project_id}")
    assert response.status_code == 200
    read_project_data = response.json()
    assert read_project_data["project_id"] == project_id
    assert read_project_data["project_name"] == "Readable Project"


async def test_read_nonexistent_project(client: AsyncClient):
    non_existent_project_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/projects/{non_existent_project_id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found" 