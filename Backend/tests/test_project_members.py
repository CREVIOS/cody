"""
Test suite for project_members router endpoints.
"""
import pytest
from httpx import AsyncClient
from uuid import uuid4
import time

# Mark all tests in this module as asyncio
pytestmark = pytest.mark.asyncio


async def create_test_user(client: AsyncClient, username_suffix: str = None):
    """Helper function to create a test user."""
    import uuid as uuid_lib
    timestamp = str(int(time.time() * 1000))
    unique_id = str(uuid_lib.uuid4())[:8]
    suffix = f"{username_suffix}_{timestamp}_{unique_id}" if username_suffix else f"{timestamp}_{unique_id}"
    
    user_data = {
        "username": f"testuser_{suffix}",
        "email": f"test_{suffix}@example.com",
        "password": "password123",
    }
    
    response = await client.post("/api/v1/users/", json=user_data)
    assert response.status_code == 201
    return response.json()


async def create_test_project(client: AsyncClient, owner_id: str, project_name: str = None):
    """Helper function to create a test project."""
    timestamp = str(int(time.time() * 1000))
    name = project_name or f"Test Project {timestamp}"
    
    project_data = {
        "project_name": name,
        "description": "A test project",
        "owner_id": owner_id,
    }
    
    response = await client.post("/api/v1/projects/", json=project_data)
    assert response.status_code == 201
    return response.json()


async def create_test_role(client: AsyncClient, role_name: str = None):
    """Helper function to create a test role."""
    import uuid as uuid_lib
    timestamp = str(int(time.time() * 1000))
    unique_id = str(uuid_lib.uuid4())[:8]
    name = f"{role_name}_{timestamp}_{unique_id}" if role_name else f"test_role_{timestamp}_{unique_id}"
    
    role_data = {
        "role_name": name,
        "description": "Test role",
        "permissions": {"canView": True, "canEdit": False},
    }
    
    response = await client.post("/api/v1/roles/", json=role_data)
    assert response.status_code == 201
    return response.json()


class TestCreateProjectMember:
    """Test POST /project-members/ endpoint."""
    
    async def test_create_project_member_success(self, client: AsyncClient):
        """Test successful project member creation."""
        # Create owner, project, user, and role
        owner = await create_test_user(client, "owner")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member")
        role = await create_test_role(client, "editor")
        
        # Create project member
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        
        response = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        assert response.status_code == 201
        member = response.json()
        assert member["project_id"] == project["project_id"]
        assert member["user_id"] == user["user_id"]
        assert member["role_id"] == role["role_id"]
    
    async def test_create_project_member_project_not_found(self, client: AsyncClient):
        """Test creating member with non-existent project."""
        owner = await create_test_user(client, "owner1")
        user = await create_test_user(client, "member1")
        role = await create_test_role(client, "role1")
        
        member_data = {
            "project_id": str(uuid4()),
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        
        response = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]
    
    async def test_create_project_member_user_not_found(self, client: AsyncClient):
        """Test creating member with non-existent user."""
        owner = await create_test_user(client, "owner2")
        project = await create_test_project(client, owner["user_id"])
        role = await create_test_role(client, "role2")
        
        member_data = {
            "project_id": project["project_id"],
            "user_id": str(uuid4()),
            "role_id": role["role_id"],
        }
        
        response = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        assert response.status_code == 404
        assert "User not found" in response.json()["detail"]
    
    async def test_create_project_member_role_not_found(self, client: AsyncClient):
        """Test creating member with non-existent role."""
        owner = await create_test_user(client, "owner3")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member3")
        
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": str(uuid4()),
        }
        
        response = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        assert response.status_code == 404
        assert "Role not found" in response.json()["detail"]
    
    async def test_create_project_member_permission_denied(self, client: AsyncClient):
        """Test creating member without permission."""
        owner = await create_test_user(client, "owner4")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member4")
        unauthorized_user = await create_test_user(client, "unauthorized")
        role = await create_test_role(client, "role4")
        
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        
        response = await client.post(
            f"/api/v1/project-members/?actor_id={unauthorized_user['user_id']}",
            json=member_data
        )
        assert response.status_code == 403
    
    async def test_create_project_member_duplicate(self, client: AsyncClient):
        """Test creating duplicate project member."""
        owner = await create_test_user(client, "owner5")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member5")
        role = await create_test_role(client, "role5")
        
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        
        # Create first member
        response1 = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        assert response1.status_code == 201
        
        # Try to create duplicate
        response2 = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        assert response2.status_code == 400
        assert "already a member" in response2.json()["detail"]


class TestReadProjectMembers:
    """Test GET /project-members/ endpoint."""
    
    async def test_read_project_members_success(self, client: AsyncClient):
        """Test reading project members list."""
        owner = await create_test_user(client, "owner6")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member6")
        role = await create_test_role(client, "role6")
        
        # Create a member
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        
        # Read members
        response = await client.get("/api/v1/project-members/")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert len(data["items"]) >= 1
    
    async def test_read_project_members_with_filters(self, client: AsyncClient):
        """Test reading project members with filters."""
        owner = await create_test_user(client, "owner7")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member7")
        role = await create_test_role(client, "role7")
        
        # Create a member
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        
        # Read members with project filter
        response = await client.get(
            f"/api/v1/project-members/?project_id={project['project_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        assert all(m["project_id"] == project["project_id"] for m in data["items"])
        
        # Read members with user filter
        response = await client.get(
            f"/api/v1/project-members/?user_id={user['user_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        assert all(m["user_id"] == user["user_id"] for m in data["items"])
    
    async def test_read_project_members_pagination(self, client: AsyncClient):
        """Test reading project members with pagination."""
        owner = await create_test_user(client, "owner8")
        project = await create_test_project(client, owner["user_id"])
        role = await create_test_role(client, "role8")
        
        # Create multiple members
        for i in range(3):
            user = await create_test_user(client, f"member8_{i}")
            member_data = {
                "project_id": project["project_id"],
                "user_id": user["user_id"],
                "role_id": role["role_id"],
            }
            await client.post(
                f"/api/v1/project-members/?actor_id={owner['user_id']}",
                json=member_data
            )
        
        # Test pagination
        response = await client.get(
            f"/api/v1/project-members/?skip=0&limit=2&project_id={project['project_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) <= 2
        assert data["total"] >= 3


class TestReadProjectMember:
    """Test GET /project-members/{member_id} endpoint."""
    
    async def test_read_project_member_success(self, client: AsyncClient):
        """Test reading a single project member."""
        owner = await create_test_user(client, "owner9")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member9")
        role = await create_test_role(client, "role9")
        
        # Create a member
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        create_response = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        member_id = create_response.json()["project_member_id"]
        
        # Read the member
        response = await client.get(f"/api/v1/project-members/{member_id}")
        assert response.status_code == 200
        member = response.json()
        assert member["project_member_id"] == member_id
    
    async def test_read_project_member_not_found(self, client: AsyncClient):
        """Test reading non-existent project member."""
        fake_id = str(uuid4())
        response = await client.get(f"/api/v1/project-members/{fake_id}")
        assert response.status_code == 404
        assert "Project member not found" in response.json()["detail"]


class TestUpdateProjectMember:
    """Test PUT /project-members/{member_id} endpoint."""
    
    async def test_update_project_member_success(self, client: AsyncClient):
        """Test successful project member update."""
        owner = await create_test_user(client, "owner10")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member10")
        role1 = await create_test_role(client, "role10a")
        role2 = await create_test_role(client, "role10b")
        
        # Create a member
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role1["role_id"],
        }
        create_response = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        member_id = create_response.json()["project_member_id"]
        
        # Update the member
        update_data = {"role_id": role2["role_id"]}
        response = await client.put(
            f"/api/v1/project-members/{member_id}?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 200
        updated_member = response.json()
        assert updated_member["role_id"] == role2["role_id"]
    
    async def test_update_project_member_not_found(self, client: AsyncClient):
        """Test updating non-existent project member."""
        owner = await create_test_user(client, "owner11")
        role = await create_test_role(client, "role11")
        
        fake_id = str(uuid4())
        update_data = {"role_id": role["role_id"]}
        response = await client.put(
            f"/api/v1/project-members/{fake_id}?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 404
        assert "Project member not found" in response.json()["detail"]
    
    async def test_update_project_member_permission_denied(self, client: AsyncClient):
        """Test updating member without permission."""
        owner = await create_test_user(client, "owner12")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member12")
        unauthorized_user = await create_test_user(client, "unauthorized12")
        role = await create_test_role(client, "role12")
        
        # Create a member
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        create_response = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        member_id = create_response.json()["project_member_id"]
        
        # Try to update without permission
        update_data = {"role_id": role["role_id"]}
        response = await client.put(
            f"/api/v1/project-members/{member_id}?actor_id={unauthorized_user['user_id']}",
            json=update_data
        )
        assert response.status_code == 403
    
    async def test_update_project_member_owner_role_change(self, client: AsyncClient):
        """Test that owner's role cannot be changed."""
        owner = await create_test_user(client, "owner13")
        project = await create_test_project(client, owner["user_id"])
        role = await create_test_role(client, "role13")
        
        # Try to update owner's role (owner is automatically a member)
        # First, get the owner's member record
        members_response = await client.get(
            f"/api/v1/project-members/?project_id={project['project_id']}&user_id={owner['user_id']}"
        )
        if members_response.status_code == 200 and len(members_response.json()["items"]) > 0:
            member_id = members_response.json()["items"][0]["project_member_id"]
            
            update_data = {"role_id": role["role_id"]}
            response = await client.put(
                f"/api/v1/project-members/{member_id}?actor_id={owner['user_id']}",
                json=update_data
            )
            # Should fail because owner's role cannot be changed
            assert response.status_code == 403
            assert "Cannot change owner's role" in response.json()["detail"]
    
    async def test_update_project_member_role_not_found(self, client: AsyncClient):
        """Test updating member with non-existent role."""
        owner = await create_test_user(client, "owner14")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member14")
        role = await create_test_role(client, "role14")
        
        # Create a member
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        create_response = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        member_id = create_response.json()["project_member_id"]
        
        # Try to update with non-existent role
        update_data = {"role_id": str(uuid4())}
        response = await client.put(
            f"/api/v1/project-members/{member_id}?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 404
        assert "Role not found" in response.json()["detail"]


class TestUpdateMemberRole:
    """Test PATCH /project-members/by-project/{project_id}/user/{user_id}/role endpoint."""
    
    async def test_update_member_role_success(self, client: AsyncClient):
        """Test successful member role update via patch endpoint."""
        owner = await create_test_user(client, "owner15")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member15")
        role1 = await create_test_role(client, "role15a")
        role2 = await create_test_role(client, "role15b")
        
        # Create a member
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role1["role_id"],
        }
        await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        
        # Update the member's role
        update_data = {"role_id": role2["role_id"]}
        response = await client.patch(
            f"/api/v1/project-members/by-project/{project['project_id']}/user/{user['user_id']}/role?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 200
        updated_member = response.json()
        assert updated_member["role_id"] == role2["role_id"]
    
    async def test_update_member_role_project_not_found(self, client: AsyncClient):
        """Test updating member role with non-existent project."""
        owner = await create_test_user(client, "owner16")
        user = await create_test_user(client, "member16")
        role = await create_test_role(client, "role16")
        
        fake_project_id = str(uuid4())
        update_data = {"role_id": role["role_id"]}
        response = await client.patch(
            f"/api/v1/project-members/by-project/{fake_project_id}/user/{user['user_id']}/role?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]
    
    async def test_update_member_role_user_not_found(self, client: AsyncClient):
        """Test updating member role with non-existent user."""
        owner = await create_test_user(client, "owner17")
        project = await create_test_project(client, owner["user_id"])
        role = await create_test_role(client, "role17")
        
        fake_user_id = str(uuid4())
        update_data = {"role_id": role["role_id"]}
        response = await client.patch(
            f"/api/v1/project-members/by-project/{project['project_id']}/user/{fake_user_id}/role?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 404
        assert "User not found" in response.json()["detail"]
    
    async def test_update_member_role_member_not_found(self, client: AsyncClient):
        """Test updating role for non-member user."""
        owner = await create_test_user(client, "owner18")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member18")
        role = await create_test_role(client, "role18")
        
        update_data = {"role_id": role["role_id"]}
        response = await client.patch(
            f"/api/v1/project-members/by-project/{project['project_id']}/user/{user['user_id']}/role?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 404
        assert "Project member not found" in response.json()["detail"]


class TestDeleteProjectMember:
    """Test DELETE /project-members/{member_id} endpoint."""
    
    async def test_delete_project_member_success(self, client: AsyncClient):
        """Test successful project member deletion."""
        owner = await create_test_user(client, "owner19")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member19")
        role = await create_test_role(client, "role19")
        
        # Create a member
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        create_response = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        member_id = create_response.json()["project_member_id"]
        
        # Delete the member
        response = await client.delete(
            f"/api/v1/project-members/{member_id}?actor_id={owner['user_id']}"
        )
        assert response.status_code == 204
        
        # Verify member is deleted
        get_response = await client.get(f"/api/v1/project-members/{member_id}")
        assert get_response.status_code == 404
    
    async def test_delete_project_member_not_found(self, client: AsyncClient):
        """Test deleting non-existent project member."""
        owner = await create_test_user(client, "owner20")
        fake_id = str(uuid4())
        response = await client.delete(
            f"/api/v1/project-members/{fake_id}?actor_id={owner['user_id']}"
        )
        assert response.status_code == 404
        assert "Project member not found" in response.json()["detail"]
    
    async def test_delete_project_member_permission_denied(self, client: AsyncClient):
        """Test deleting member without permission."""
        owner = await create_test_user(client, "owner21")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member21")
        unauthorized_user = await create_test_user(client, "unauthorized21")
        role = await create_test_role(client, "role21")
        
        # Create a member
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        create_response = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        member_id = create_response.json()["project_member_id"]
        
        # Try to delete without permission
        response = await client.delete(
            f"/api/v1/project-members/{member_id}?actor_id={unauthorized_user['user_id']}"
        )
        assert response.status_code == 403


class TestGetProjectMembersWithDetails:
    """Test GET /project-members/by-project/{project_id} endpoint."""
    
    async def test_get_project_members_with_details_success(self, client: AsyncClient):
        """Test getting project members with details."""
        owner = await create_test_user(client, "owner22")
        project = await create_test_project(client, owner["user_id"])
        user = await create_test_user(client, "member22")
        role = await create_test_role(client, "role22")
        
        # Create a member
        member_data = {
            "project_id": project["project_id"],
            "user_id": user["user_id"],
            "role_id": role["role_id"],
        }
        await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        
        # Get members with details
        response = await client.get(
            f"/api/v1/project-members/by-project/{project['project_id']}"
        )
        assert response.status_code == 200
        members = response.json()
        assert isinstance(members, list)
        assert len(members) >= 1
        # Check that owner is included
        owner_in_list = any(m.get("user_id") == owner["user_id"] for m in members)
        assert owner_in_list
    
    async def test_get_project_members_with_details_project_not_found(self, client: AsyncClient):
        """Test getting members for non-existent project."""
        fake_project_id = str(uuid4())
        response = await client.get(
            f"/api/v1/project-members/by-project/{fake_project_id}"
        )
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]

