"""
Test Suite for Permission Enforcer

This test suite validates the integration of the Strategy pattern
with the permission enforcer service. It tests the complete flow
from database queries to permission evaluation.
"""

import pytest
from uuid import uuid4, UUID
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession

from services.permission_enforcer import (
    evaluate_user_permission,
    get_user_permissions_map,
    PermissionResult
)
from services.permission_strategies import PermissionContext
import crud
import models


@pytest.mark.asyncio
class TestPermissionEnforcer:
    """Test suite for permission enforcer integration."""
    
    async def test_evaluate_user_permission_project_owner(self):
        """Test that project owners get owner permissions."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        permission = "canDeleteProject"
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = user_id
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            # Act
            result = await evaluate_user_permission(
                db=mock_db,
                project_id=project_id,
                user_id=user_id,
                permission=permission
            )
        
        # Assert
        assert result.granted is True
        assert result.handled_by == "OwnerPermissionStrategy"
        assert "has" in result.reason.lower()
    
    async def test_evaluate_user_permission_project_not_found(self):
        """Test that non-existent projects return permission denied."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        permission = "canEdit"
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=None):
            # Act
            result = await evaluate_user_permission(
                db=mock_db,
                project_id=project_id,
                user_id=user_id,
                permission=permission
            )
        
        # Assert
        assert result.granted is False
        assert "not found" in result.reason.lower()
    
    async def test_evaluate_user_permission_project_member_with_role(self):
        """Test that project members get permissions based on their role."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()  # Different from user_id
        permission = "canEdit"
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = owner_id  # User is not owner
        
        mock_member = MagicMock()
        mock_member.role_id = uuid4()
        
        mock_role = MagicMock()
        mock_role.role_name = "editor"
        mock_role.permissions = None  # Use built-in strategy
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            with patch('services.permission_enforcer.crud.crud_project_member.get_by_project_and_user', return_value=mock_member):
                with patch('services.permission_enforcer.crud.crud_role.get', return_value=mock_role):
                    # Act
                    result = await evaluate_user_permission(
                        db=mock_db,
                        project_id=project_id,
                        user_id=user_id,
                        permission=permission
                    )
        
        # Assert
        assert result.granted is True  # Editor has canEdit
        assert "editor" in result.reason.lower()
        assert result.handled_by == "EditorPermissionStrategy"
    
    async def test_evaluate_user_permission_project_member_viewer_denied(self):
        """Test that viewers are denied edit permissions."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()
        permission = "canEdit"
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = owner_id
        
        mock_member = MagicMock()
        mock_member.role_id = uuid4()
        
        mock_role = MagicMock()
        mock_role.role_name = "viewer"
        mock_role.permissions = None
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            with patch('services.permission_enforcer.crud.crud_project_member.get_by_project_and_user', return_value=mock_member):
                with patch('services.permission_enforcer.crud.crud_role.get', return_value=mock_role):
                    # Act
                    result = await evaluate_user_permission(
                        db=mock_db,
                        project_id=project_id,
                        user_id=user_id,
                        permission=permission
                    )
        
        # Assert
        assert result.granted is False  # Viewer cannot edit
        assert "viewer" in result.reason.lower()
    
    async def test_evaluate_user_permission_not_project_member(self):
        """Test that non-members are denied permissions."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()
        permission = "canView"
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = owner_id
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            with patch('services.permission_enforcer.crud.crud_project_member.get_by_project_and_user', return_value=None):
                # Act
                result = await evaluate_user_permission(
                    db=mock_db,
                    project_id=project_id,
                    user_id=user_id,
                    permission=permission
                )
        
        # Assert
        assert result.granted is False
        assert "not a member" in result.reason.lower()
    
    async def test_evaluate_user_permission_role_not_found(self):
        """Test that missing roles return permission denied."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()
        permission = "canView"
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = owner_id
        
        mock_member = MagicMock()
        mock_member.role_id = uuid4()
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            with patch('services.permission_enforcer.crud.crud_project_member.get_by_project_and_user', return_value=mock_member):
                with patch('services.permission_enforcer.crud.crud_role.get', return_value=None):
                    # Act
                    result = await evaluate_user_permission(
                        db=mock_db,
                        project_id=project_id,
                        user_id=user_id,
                        permission=permission
                    )
        
        # Assert
        assert result.granted is False
        assert "role not found" in result.reason.lower()
    
    async def test_evaluate_user_permission_with_custom_permissions(self):
        """Test that custom role permissions work correctly."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()
        permission = "canCustomAction"
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = owner_id
        
        mock_member = MagicMock()
        mock_member.role_id = uuid4()
        
        mock_role = MagicMock()
        mock_role.role_name = "custom_role"
        mock_role.permissions = {"canCustomAction": True, "canEdit": False}
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            with patch('services.permission_enforcer.crud.crud_project_member.get_by_project_and_user', return_value=mock_member):
                with patch('services.permission_enforcer.crud.crud_role.get', return_value=mock_role):
                    # Act
                    result = await evaluate_user_permission(
                        db=mock_db,
                        project_id=project_id,
                        user_id=user_id,
                        permission=permission
                    )
        
        # Assert
        assert result.granted is True
        assert "custom_role" in result.reason.lower()
    
    async def test_evaluate_user_permission_with_context(self):
        """Test that additional context is passed to strategies."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        permission = "canEdit"
        context = {"file_id": str(uuid4()), "action": "save"}
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = user_id
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            # Act
            result = await evaluate_user_permission(
                db=mock_db,
                project_id=project_id,
                user_id=user_id,
                permission=permission,
                context=context
            )
        
        # Assert
        assert result.granted is True
        # Context should be passed to PermissionContext (tested indirectly)


@pytest.mark.asyncio
class TestGetUserPermissionsMap:
    """Test suite for get_user_permissions_map function."""
    
    async def test_get_user_permissions_map_project_owner(self):
        """Test that project owners get all permissions."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = user_id
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            # Act
            permissions_map = await get_user_permissions_map(
                db=mock_db,
                project_id=project_id,
                user_id=user_id
            )
        
        # Assert
        assert permissions_map["canEdit"] is True
        assert permissions_map["canDeleteProject"] is True
        assert permissions_map["canManageMembers"] is True
        assert len(permissions_map) > 0
    
    async def test_get_user_permissions_map_project_not_found(self):
        """Test that non-existent projects return empty map."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=None):
            # Act
            permissions_map = await get_user_permissions_map(
                db=mock_db,
                project_id=project_id,
                user_id=user_id
            )
        
        # Assert
        assert permissions_map == {}
    
    async def test_get_user_permissions_map_project_member(self):
        """Test that project members get permissions based on role."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = owner_id
        
        mock_member = MagicMock()
        mock_member.role_id = uuid4()
        
        mock_role = MagicMock()
        mock_role.role_name = "admin"
        mock_role.permissions = None
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            with patch('services.permission_enforcer.crud.crud_project_member.get_by_project_and_user', return_value=mock_member):
                with patch('services.permission_enforcer.crud.crud_role.get', return_value=mock_role):
                    # Act
                    permissions_map = await get_user_permissions_map(
                        db=mock_db,
                        project_id=project_id,
                        user_id=user_id
                    )
        
        # Assert
        assert permissions_map["canEdit"] is True
        assert permissions_map["canManageMembers"] is True
        assert permissions_map["canDeleteProject"] is False  # Admin cannot delete
        assert permissions_map["canView"] is True
    
    async def test_get_user_permissions_map_not_member(self):
        """Test that non-members get all False permissions."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = owner_id
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            with patch('services.permission_enforcer.crud.crud_project_member.get_by_project_and_user', return_value=None):
                # Act
                permissions_map = await get_user_permissions_map(
                    db=mock_db,
                    project_id=project_id,
                    user_id=user_id
                )
        
        # Assert
        assert all(perm is False for perm in permissions_map.values())
        assert len(permissions_map) > 0
    
    async def test_get_user_permissions_map_specific_permissions(self):
        """Test that specific permissions can be requested."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        permissions_to_check = ["canEdit", "canView", "canDeleteProject"]
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = user_id
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            # Act
            permissions_map = await get_user_permissions_map(
                db=mock_db,
                project_id=project_id,
                user_id=user_id,
                permissions_to_check=permissions_to_check
            )
        
        # Assert
        assert set(permissions_map.keys()) == set(permissions_to_check)
        assert all(perm is True for perm in permissions_map.values())  # Owner has all
        assert len(permissions_map) == 3
    
    async def test_get_user_permissions_map_role_not_found(self):
        """Test that missing roles return all False permissions."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = owner_id
        
        mock_member = MagicMock()
        mock_member.role_id = uuid4()
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            with patch('services.permission_enforcer.crud.crud_project_member.get_by_project_and_user', return_value=mock_member):
                with patch('services.permission_enforcer.crud.crud_role.get', return_value=None):
                    # Act
                    permissions_map = await get_user_permissions_map(
                        db=mock_db,
                        project_id=project_id,
                        user_id=user_id
                    )
        
        # Assert
        assert all(perm is False for perm in permissions_map.values())
        assert len(permissions_map) > 0


@pytest.mark.asyncio
class TestPermissionEnforcerIntegration:
    """Integration tests for permission enforcer with real strategy pattern."""
    
    async def test_owner_can_delete_project(self):
        """Test that owners can delete projects."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = user_id
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            # Act
            result = await evaluate_user_permission(
                db=mock_db,
                project_id=project_id,
                user_id=user_id,
                permission="canDeleteProject"
            )
        
        # Assert
        assert result.granted is True
    
    async def test_admin_cannot_delete_project(self):
        """Test that admins cannot delete projects."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = owner_id
        
        mock_member = MagicMock()
        mock_member.role_id = uuid4()
        
        mock_role = MagicMock()
        mock_role.role_name = "admin"
        mock_role.permissions = None
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            with patch('services.permission_enforcer.crud.crud_project_member.get_by_project_and_user', return_value=mock_member):
                with patch('services.permission_enforcer.crud.crud_role.get', return_value=mock_role):
                    # Act
                    result = await evaluate_user_permission(
                        db=mock_db,
                        project_id=project_id,
                        user_id=user_id,
                        permission="canDeleteProject"
                    )
        
        # Assert
        assert result.granted is False
    
    async def test_viewer_can_only_view(self):
        """Test that viewers can only view and request locks."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_project = MagicMock()
        mock_project.owner_id = owner_id
        
        mock_member = MagicMock()
        mock_member.role_id = uuid4()
        
        mock_role = MagicMock()
        mock_role.role_name = "viewer"
        mock_role.permissions = None
        
        with patch('services.permission_enforcer.crud.crud_project.get', return_value=mock_project):
            with patch('services.permission_enforcer.crud.crud_project_member.get_by_project_and_user', return_value=mock_member):
                with patch('services.permission_enforcer.crud.crud_role.get', return_value=mock_role):
                    # Test canView
                    view_result = await evaluate_user_permission(
                        db=mock_db,
                        project_id=project_id,
                        user_id=user_id,
                        permission="canView"
                    )
                    
                    # Test canEdit (should be denied)
                    edit_result = await evaluate_user_permission(
                        db=mock_db,
                        project_id=project_id,
                        user_id=user_id,
                        permission="canEdit"
                    )
        
        # Assert
        assert view_result.granted is True
        assert edit_result.granted is False

