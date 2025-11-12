"""
Test Suite for Strategy Pattern Implementation

This test suite demonstrates and validates the Strategy pattern
implementation for the RBAC system.
"""

import pytest
from services.permission_strategies import (
    OwnerPermissionStrategy,
    AdminPermissionStrategy,
    EditorPermissionStrategy,
    ViewerPermissionStrategy,
    DataDrivenPermissionStrategy,
    PermissionStrategyFactory,
    PermissionEvaluator,
    PermissionContext,
    create_permission_evaluator
)


class TestPermissionStrategies:
    """Test individual permission strategies."""
    
    def setup_method(self):
        """Set up test context."""
        self.context = PermissionContext(
            project_id="test-project-123",
            user_id="test-user-456"
        )
    
    def test_owner_strategy_has_all_permissions(self):
        """Test that owner strategy grants all permissions."""
        strategy = OwnerPermissionStrategy()
        
        # Test all known permissions
        permissions_to_test = [
            "canEdit", "canLock", "canView", "canInvite",
            "canApproveLock", "canRequestLock", "canDeleteProject",
            "canManageMembers", "canManageRoles", "canViewAnalytics"
        ]
        
        for permission in permissions_to_test:
            assert strategy.has_permission(permission, self.context), f"Owner should have {permission}"
        
        # Test that all permissions are returned
        all_permissions = strategy.get_all_permissions(self.context)
        assert len(all_permissions) > 0
        assert "canEdit" in all_permissions
        assert "canDeleteProject" in all_permissions
        
        # Test role name
        assert strategy.get_role_name() == "owner"
    
    def test_admin_strategy_permissions(self):
        """Test admin strategy has correct permissions."""
        strategy = AdminPermissionStrategy()
        
        # Admin should have these permissions
        admin_permissions = [
            "canEdit", "canLock", "canView", "canInvite",
            "canApproveLock", "canRequestLock", "canManageMembers"
        ]
        
        for permission in admin_permissions:
            assert strategy.has_permission(permission, self.context), f"Admin should have {permission}"
        
        # Admin should NOT have these permissions
        forbidden_permissions = ["canDeleteProject", "canManageRoles"]
        
        for permission in forbidden_permissions:
            assert not strategy.has_permission(permission, self.context), f"Admin should NOT have {permission}"
        
        assert strategy.get_role_name() == "admin"
    
    def test_editor_strategy_permissions(self):
        """Test editor strategy has correct permissions."""
        strategy = EditorPermissionStrategy()
        
        # Editor should have these permissions
        editor_permissions = ["canEdit", "canLock", "canView", "canRequestLock"]
        
        for permission in editor_permissions:
            assert strategy.has_permission(permission, self.context), f"Editor should have {permission}"
        
        # Editor should NOT have these permissions
        forbidden_permissions = [
            "canInvite", "canApproveLock", "canDeleteProject", 
            "canManageMembers", "canManageRoles"
        ]
        
        for permission in forbidden_permissions:
            assert not strategy.has_permission(permission, self.context), f"Editor should NOT have {permission}"
        
        assert strategy.get_role_name() == "editor"
    
    def test_viewer_strategy_permissions(self):
        """Test viewer strategy has minimal permissions."""
        strategy = ViewerPermissionStrategy()
        
        # Viewer should only have these permissions
        viewer_permissions = ["canView", "canRequestLock"]
        
        for permission in viewer_permissions:
            assert strategy.has_permission(permission, self.context), f"Viewer should have {permission}"
        
        # Viewer should NOT have these permissions
        forbidden_permissions = [
            "canEdit", "canLock", "canInvite", "canApproveLock",
            "canDeleteProject", "canManageMembers"
        ]
        
        for permission in forbidden_permissions:
            assert not strategy.has_permission(permission, self.context), f"Viewer should NOT have {permission}"
        
        assert strategy.get_role_name() == "viewer"
    
    def test_data_driven_strategy(self):
        """Test data-driven strategy with custom permissions."""
        custom_permissions = {
            "canEdit": True,
            "canView": True,
            "canDelete": False,
            "canManage": True
        }
        
        strategy = DataDrivenPermissionStrategy("custom_role", custom_permissions)
        
        # Test granted permissions
        assert strategy.has_permission("canEdit", self.context)
        assert strategy.has_permission("canView", self.context)
        assert strategy.has_permission("canManage", self.context)
        
        # Test denied permissions
        assert not strategy.has_permission("canDelete", self.context)
        assert not strategy.has_permission("nonexistent", self.context)
        
        # Test all permissions
        all_permissions = strategy.get_all_permissions(self.context)
        expected_granted = {"canEdit", "canView", "canManage"}
        assert all_permissions == expected_granted
        
        assert strategy.get_role_name() == "custom_role"
    
    def test_data_driven_strategy_with_none_permissions(self):
        """Test data-driven strategy handles None permissions gracefully."""
        strategy = DataDrivenPermissionStrategy("custom_role", None)
        # Should default to empty dict
        assert not strategy.has_permission("canEdit", self.context)
        assert len(strategy.get_all_permissions(self.context)) == 0
    
    def test_permission_context_with_additional_data(self):
        """Test PermissionContext with additional_data field."""
        context = PermissionContext(
            project_id="test-project",
            user_id="test-user",
            additional_data={"key": "value", "number": 42}
        )
        # Verify context is created correctly
        assert context.project_id == "test-project"
        assert context.user_id == "test-user"
        assert context.additional_data == {"key": "value", "number": 42}
        
        # Test that strategies work with context that has additional_data
        strategy = OwnerPermissionStrategy()
        assert strategy.has_permission("canEdit", context)


class TestPermissionStrategyFactory:
    """Test the strategy factory."""
    
    def test_factory_creates_built_in_strategies(self):
        """Test factory creates correct built-in strategies."""
        # Test owner
        owner_strategy = PermissionStrategyFactory.create_strategy("owner")
        assert isinstance(owner_strategy, OwnerPermissionStrategy)
        
        # Test admin
        admin_strategy = PermissionStrategyFactory.create_strategy("ADMIN")  # Case insensitive
        assert isinstance(admin_strategy, AdminPermissionStrategy)
        
        # Test editor
        editor_strategy = PermissionStrategyFactory.create_strategy("editor")
        assert isinstance(editor_strategy, EditorPermissionStrategy)
        
        # Test viewer
        viewer_strategy = PermissionStrategyFactory.create_strategy("Viewer")
        assert isinstance(viewer_strategy, ViewerPermissionStrategy)
    
    def test_factory_creates_data_driven_strategy_for_unknown_roles(self):
        """Test factory falls back to data-driven strategy for unknown roles."""
        custom_permissions = {"canEdit": True, "canView": False}
        
        strategy = PermissionStrategyFactory.create_strategy("unknown_role", custom_permissions)
        assert isinstance(strategy, DataDrivenPermissionStrategy)
        assert strategy.get_role_name() == "unknown_role"
        assert strategy.has_permission("canEdit", PermissionContext("proj", "user"))
        assert not strategy.has_permission("canView", PermissionContext("proj", "user"))
    
    def test_factory_creates_data_driven_strategy_with_none_permissions(self):
        """Test factory handles None permissions by using empty dict."""
        strategy = PermissionStrategyFactory.create_strategy("custom_role", None)
        assert isinstance(strategy, DataDrivenPermissionStrategy)
        context = PermissionContext("proj", "user")
        # Should handle None gracefully and return empty permissions
        assert not strategy.has_permission("canEdit", context)
        assert len(strategy.get_all_permissions(context)) == 0


class TestPermissionEvaluator:
    """Test the permission evaluator (Strategy pattern context)."""
    
    def setup_method(self):
        """Set up test context."""
        self.context = PermissionContext(
            project_id="test-project-123",
            user_id="test-user-456"
        )
    
    def test_evaluator_with_owner_strategy(self):
        """Test evaluator with owner strategy."""
        evaluator = PermissionEvaluator(OwnerPermissionStrategy())
        
        assert evaluator.has_permission("canEdit", self.context)
        assert evaluator.has_permission("canDeleteProject", self.context)
        assert evaluator.get_role_name() == "owner"
        
        # Test permissions map
        permissions_map = evaluator.get_permissions_map(self.context)
        assert permissions_map["canEdit"] is True
        assert permissions_map["canDeleteProject"] is True
    
    def test_evaluator_strategy_switching(self):
        """Test that evaluator can switch strategies at runtime."""
        evaluator = PermissionEvaluator(ViewerPermissionStrategy())
        
        # Initially viewer - cannot edit
        assert not evaluator.has_permission("canEdit", self.context)
        assert evaluator.get_role_name() == "viewer"
        
        # Switch to editor strategy
        evaluator.set_strategy(EditorPermissionStrategy())
        
        # Now can edit
        assert evaluator.has_permission("canEdit", self.context)
        assert evaluator.get_role_name() == "editor"
        
        # Switch to owner strategy
        evaluator.set_strategy(OwnerPermissionStrategy())
        
        # Now has all permissions
        assert evaluator.has_permission("canDeleteProject", self.context)
        assert evaluator.get_role_name() == "owner"
    
    def test_evaluator_permissions_map_with_specific_permissions(self):
        """Test evaluator permissions map with specific permissions to check."""
        evaluator = PermissionEvaluator(EditorPermissionStrategy())
        
        specific_permissions = {"canEdit", "canView", "canDeleteProject"}
        permissions_map = evaluator.get_permissions_map(self.context, specific_permissions)
        
        assert permissions_map["canEdit"] is True
        assert permissions_map["canView"] is True
        assert permissions_map["canDeleteProject"] is False
        
        # Should only contain the requested permissions
        assert len(permissions_map) == 3
    
    def test_evaluator_get_all_permissions(self):
        """Test that evaluator.get_all_permissions delegates to strategy."""
        # Test with owner strategy
        evaluator = PermissionEvaluator(OwnerPermissionStrategy())
        all_permissions = evaluator.get_all_permissions(self.context)
        
        assert isinstance(all_permissions, set)
        assert len(all_permissions) > 0
        assert "canEdit" in all_permissions
        assert "canDeleteProject" in all_permissions
        assert "canManageMembers" in all_permissions
        
        # Test with editor strategy
        evaluator.set_strategy(EditorPermissionStrategy())
        all_permissions = evaluator.get_all_permissions(self.context)
        
        assert "canEdit" in all_permissions
        assert "canView" in all_permissions
        assert "canDeleteProject" not in all_permissions
        assert "canManageMembers" not in all_permissions
        
        # Test with admin strategy
        evaluator.set_strategy(AdminPermissionStrategy())
        all_permissions = evaluator.get_all_permissions(self.context)
        
        assert "canEdit" in all_permissions
        assert "canInvite" in all_permissions
        assert "canManageMembers" in all_permissions
        assert "canDeleteProject" not in all_permissions


class TestConvenienceFunctions:
    """Test convenience functions."""
    
    def test_create_permission_evaluator_with_built_in_roles(self):
        """Test convenience function with built-in roles."""
        context = PermissionContext("proj", "user")
        
        # Test owner
        owner_evaluator = create_permission_evaluator("owner")
        assert owner_evaluator.has_permission("canDeleteProject", context)
        
        # Test admin
        admin_evaluator = create_permission_evaluator("admin")
        assert admin_evaluator.has_permission("canEdit", context)
        assert not admin_evaluator.has_permission("canDeleteProject", context)
    
    def test_create_permission_evaluator_with_custom_role(self):
        """Test convenience function with custom role permissions."""
        custom_permissions = {
            "canEdit": True,
            "canView": True,
            "canSpecialAction": True
        }
        
        evaluator = create_permission_evaluator("custom_role", custom_permissions)
        context = PermissionContext("proj", "user")
        
        assert evaluator.has_permission("canEdit", context)
        assert evaluator.has_permission("canSpecialAction", context)
        assert not evaluator.has_permission("canDeleteProject", context)


class TestStrategyPatternBenefits:
    """Test that demonstrates the benefits of the Strategy pattern."""
    
    def test_open_closed_principle(self):
        """
        Test that we can add new roles without modifying existing code.
        This demonstrates the Open/Closed Principle.
        """
        # Define a new role strategy without modifying existing strategies
        class ModeratorPermissionStrategy(OwnerPermissionStrategy):
            MODERATOR_PERMISSIONS = {
                "canEdit", "canView", "canLock", "canApproveLock",
                "canManageMembers"  # But not canDeleteProject
            }
            
            def has_permission(self, permission, context):
                return permission in self.MODERATOR_PERMISSIONS
            
            def get_all_permissions(self, context):
                return self.MODERATOR_PERMISSIONS.copy()
            
            def get_role_name(self):
                return "moderator"
        
        # Use the new strategy without changing any existing code
        evaluator = PermissionEvaluator(ModeratorPermissionStrategy())
        context = PermissionContext("proj", "user")
        
        assert evaluator.has_permission("canEdit", context)
        assert evaluator.has_permission("canManageMembers", context)
        assert not evaluator.has_permission("canDeleteProject", context)
    
    def test_runtime_role_changes(self):
        """
        Test that roles can be changed at runtime.
        This demonstrates the flexibility of the Strategy pattern.
        """
        evaluator = PermissionEvaluator(ViewerPermissionStrategy())
        context = PermissionContext("proj", "user")
        
        # User starts as viewer
        assert not evaluator.has_permission("canEdit", context)
        
        # User gets promoted to editor
        evaluator.set_strategy(EditorPermissionStrategy())
        assert evaluator.has_permission("canEdit", context)
        assert not evaluator.has_permission("canDeleteProject", context)
        
        # User gets promoted to admin
        evaluator.set_strategy(AdminPermissionStrategy())
        assert evaluator.has_permission("canEdit", context)
        assert evaluator.has_permission("canManageMembers", context)
        assert not evaluator.has_permission("canDeleteProject", context)
        
        # User becomes owner
        evaluator.set_strategy(OwnerPermissionStrategy())
        assert evaluator.has_permission("canDeleteProject", context)
    
    def test_encapsulation_and_single_responsibility(self):
        """
        Test that each strategy encapsulates its own logic.
        This demonstrates encapsulation and single responsibility.
        """
        strategies = [
            OwnerPermissionStrategy(),
            AdminPermissionStrategy(),
            EditorPermissionStrategy(),
            ViewerPermissionStrategy()
        ]
        
        context = PermissionContext("proj", "user")
        
        # Each strategy has its own logic and doesn't depend on others
        for strategy in strategies:
            # Each strategy can independently determine its permissions
            permissions = strategy.get_all_permissions(context)
            role_name = strategy.get_role_name()
            
            # Each strategy is self-contained
            assert isinstance(permissions, set)
            assert isinstance(role_name, str)
            assert len(role_name) > 0
            
            # Each strategy can make permission decisions independently
            for permission in permissions:
                assert strategy.has_permission(permission, context)
    
    def test_abstract_strategy_cannot_be_instantiated(self):
        """Test that abstract PermissionStrategy cannot be instantiated directly."""
        from abc import ABC
        from services.permission_strategies import PermissionStrategy
        
        # Attempting to instantiate abstract class should raise TypeError
        with pytest.raises(TypeError):
            PermissionStrategy()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
