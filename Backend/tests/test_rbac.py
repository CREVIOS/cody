"""
Test Suite for RBAC Helper Functions

This test suite validates the RBAC helper functions that check
user roles and permissions in projects.
"""

import pytest
from uuid import uuid4, UUID
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession

from rbac import (
    _role_for_user,
    ensure_can_view_project,
    ensure_can_request_lock,
    ensure_can_preempt,
    OWNER,
    EDITOR,
    VIEWER
)
import models


@pytest.mark.asyncio
class TestRoleForUser:
    """Test suite for _role_for_user function."""
    
    async def test_role_for_user_as_owner(self):
        """Test that project owners are identified correctly."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = user_id  # Owner ID matches user_id
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Act
        role = await _role_for_user(mock_db, project_id, user_id)
        
        # Assert
        assert role == OWNER
    
    async def test_role_for_user_as_member(self):
        """Test that project members get their assigned role."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()  # Different from user_id
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        # First query (owner check) returns different owner
        mock_owner_result = MagicMock()
        mock_owner_result.scalar_one_or_none.return_value = owner_id
        
        # Second query (member check) returns role
        mock_role_result = MagicMock()
        mock_role_result.scalar_one_or_none.return_value = EDITOR
        
        # Mock execute to return different results for each call
        async def execute_side_effect(*args, **kwargs):
            # First call returns owner result
            if not hasattr(execute_side_effect, 'call_count'):
                execute_side_effect.call_count = 0
            execute_side_effect.call_count += 1
            if execute_side_effect.call_count == 1:
                return mock_owner_result
            else:
                return mock_role_result
        
        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        
        # Act
        role = await _role_for_user(mock_db, project_id, user_id)
        
        # Assert
        assert role == EDITOR
    
    async def test_role_for_user_not_member(self):
        """Test that non-members return None."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        # First query (owner check) returns different owner
        mock_owner_result = MagicMock()
        mock_owner_result.scalar_one_or_none.return_value = owner_id
        
        # Second query (member check) returns None (not a member)
        mock_role_result = MagicMock()
        mock_role_result.scalar_one_or_none.return_value = None
        
        # Mock execute to return different results for each call
        async def execute_side_effect(*args, **kwargs):
            if not hasattr(execute_side_effect, 'call_count'):
                execute_side_effect.call_count = 0
            execute_side_effect.call_count += 1
            if execute_side_effect.call_count == 1:
                return mock_owner_result
            else:
                return mock_role_result
        
        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        
        # Act
        role = await _role_for_user(mock_db, project_id, user_id)
        
        # Assert
        assert role is None
    
    async def test_role_for_user_invalid_project_id(self):
        """Test that None project_id returns None."""
        # Arrange
        project_id = None
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        # Act
        role = await _role_for_user(mock_db, project_id, user_id)
        
        # Assert
        assert role is None
    
    async def test_role_for_user_invalid_user_id(self):
        """Test that None user_id returns None."""
        # Arrange
        project_id = uuid4()
        user_id = None
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        # Act
        role = await _role_for_user(mock_db, project_id, user_id)
        
        # Assert
        assert role is None
    
    async def test_role_for_user_viewer_role(self):
        """Test that viewer role is returned correctly."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        owner_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        # First query (owner check) returns different owner
        mock_owner_result = MagicMock()
        mock_owner_result.scalar_one_or_none.return_value = owner_id
        
        # Second query (member check) returns viewer role
        mock_role_result = MagicMock()
        mock_role_result.scalar_one_or_none.return_value = VIEWER
        
        # Mock execute to return different results for each call
        async def execute_side_effect(*args, **kwargs):
            if not hasattr(execute_side_effect, 'call_count'):
                execute_side_effect.call_count = 0
            execute_side_effect.call_count += 1
            if execute_side_effect.call_count == 1:
                return mock_owner_result
            else:
                return mock_role_result
        
        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        
        # Act
        role = await _role_for_user(mock_db, project_id, user_id)
        
        # Assert
        assert role == VIEWER


@pytest.mark.asyncio
class TestEnsureCanViewProject:
    """Test suite for ensure_can_view_project function."""
    
    async def test_ensure_can_view_project_as_owner(self):
        """Test that owners can view projects."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('rbac._role_for_user', return_value=OWNER):
            # Act & Assert - should not raise
            await ensure_can_view_project(mock_db, project_id, user_id)
    
    async def test_ensure_can_view_project_as_member(self):
        """Test that members can view projects."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('rbac._role_for_user', return_value=EDITOR):
            # Act & Assert - should not raise
            await ensure_can_view_project(mock_db, project_id, user_id)
    
    async def test_ensure_can_view_project_not_member(self):
        """Test that non-members cannot view projects."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('rbac._role_for_user', return_value=None):
            # Act & Assert - should raise PermissionError
            with pytest.raises(PermissionError, match="Not a member"):
                await ensure_can_view_project(mock_db, project_id, user_id)


@pytest.mark.asyncio
class TestEnsureCanRequestLock:
    """Test suite for ensure_can_request_lock function."""
    
    async def test_ensure_can_request_lock_as_owner(self):
        """Test that owners can request locks."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('rbac._role_for_user', return_value=OWNER):
            # Act & Assert - should not raise
            await ensure_can_request_lock(mock_db, project_id, user_id)
    
    async def test_ensure_can_request_lock_as_editor(self):
        """Test that editors can request locks."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('rbac._role_for_user', return_value=EDITOR):
            # Act & Assert - should not raise
            await ensure_can_request_lock(mock_db, project_id, user_id)
    
    async def test_ensure_can_request_lock_as_viewer(self):
        """Test that viewers cannot request locks."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('rbac._role_for_user', return_value=VIEWER):
            # Act & Assert - should raise PermissionError
            with pytest.raises(PermissionError, match="Only owners or editors"):
                await ensure_can_request_lock(mock_db, project_id, user_id)
    
    async def test_ensure_can_request_lock_not_member(self):
        """Test that non-members cannot request locks."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('rbac._role_for_user', return_value=None):
            # Act & Assert - should raise PermissionError
            with pytest.raises(PermissionError, match="Only owners or editors"):
                await ensure_can_request_lock(mock_db, project_id, user_id)


@pytest.mark.asyncio
class TestEnsureCanPreempt:
    """Test suite for ensure_can_preempt function."""
    
    async def test_ensure_can_preempt_as_owner(self):
        """Test that owners can preempt locks."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('rbac._role_for_user', return_value=OWNER):
            # Act & Assert - should not raise
            await ensure_can_preempt(mock_db, project_id, user_id)
    
    async def test_ensure_can_preempt_as_editor(self):
        """Test that editors cannot preempt locks."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('rbac._role_for_user', return_value=EDITOR):
            # Act & Assert - should raise PermissionError
            with pytest.raises(PermissionError, match="Only owner can preempt"):
                await ensure_can_preempt(mock_db, project_id, user_id)
    
    async def test_ensure_can_preempt_as_viewer(self):
        """Test that viewers cannot preempt locks."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('rbac._role_for_user', return_value=VIEWER):
            # Act & Assert - should raise PermissionError
            with pytest.raises(PermissionError, match="Only owner can preempt"):
                await ensure_can_preempt(mock_db, project_id, user_id)
    
    async def test_ensure_can_preempt_not_member(self):
        """Test that non-members cannot preempt locks."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        with patch('rbac._role_for_user', return_value=None):
            # Act & Assert - should raise PermissionError
            with pytest.raises(PermissionError, match="Only owner can preempt"):
                await ensure_can_preempt(mock_db, project_id, user_id)


@pytest.mark.asyncio
class TestRBACIntegration:
    """Integration tests for RBAC functions."""
    
    async def test_role_hierarchy(self):
        """Test that role hierarchy is respected."""
        # Arrange
        project_id = uuid4()
        user_id = uuid4()
        
        mock_db = AsyncMock(spec=AsyncSession)
        
        # Owner should pass all checks
        with patch('rbac._role_for_user', return_value=OWNER):
            await ensure_can_view_project(mock_db, project_id, user_id)
            await ensure_can_request_lock(mock_db, project_id, user_id)
            await ensure_can_preempt(mock_db, project_id, user_id)
        
        # Editor should pass view and request lock, but not preempt
        with patch('rbac._role_for_user', return_value=EDITOR):
            await ensure_can_view_project(mock_db, project_id, user_id)
            await ensure_can_request_lock(mock_db, project_id, user_id)
            with pytest.raises(PermissionError):
                await ensure_can_preempt(mock_db, project_id, user_id)
        
        # Viewer should only pass view check
        with patch('rbac._role_for_user', return_value=VIEWER):
            await ensure_can_view_project(mock_db, project_id, user_id)
            with pytest.raises(PermissionError):
                await ensure_can_request_lock(mock_db, project_id, user_id)
            with pytest.raises(PermissionError):
                await ensure_can_preempt(mock_db, project_id, user_id)

