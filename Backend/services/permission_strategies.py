"""
Strategy Pattern for Role-Based Access Control (RBAC)

This module implements the Strategy pattern for permission checking.
Each role has its own strategy that encapsulates the permission logic
for that specific role.

Design Pattern: Strategy
Purpose: Define a family of permission algorithms, encapsulate each one,
         and make them interchangeable at runtime.

Benefits:
    - Open/Closed Principle: Open for extension (new roles), closed for modification
    - Single Responsibility: Each role strategy handles only its own permissions
    - Runtime flexibility: Can change user roles dynamically
    - Eliminates conditional logic: No more if/elif chains for different roles
    - Easy testing: Each strategy can be tested independently
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Set
from dataclasses import dataclass


@dataclass
class PermissionContext:
    """Context information for permission evaluation."""
    project_id: str
    user_id: str
    additional_data: Optional[Dict[str, Any]] = None


class PermissionStrategy(ABC):
    """
    Abstract base class for permission strategies.
    
    This is the Strategy interface that defines the contract
    all concrete permission strategies must follow.
    """
    
    @abstractmethod
    def has_permission(self, permission: str, context: PermissionContext) -> bool:
        """
        Check if the role has the specified permission.
        
        Args:
            permission: The permission to check (e.g., "canEdit", "canView")
            context: Context information for the permission check
            
        Returns:
            bool: True if permission is granted, False otherwise
        """
        pass  
    
    @abstractmethod
    def get_all_permissions(self, context: PermissionContext) -> Set[str]:
        """
        Get all permissions available to this role.
        
        Args:
            context: Context information for the permission check
            
        Returns:
            Set[str]: Set of all available permissions
        """
        pass  
    
    @abstractmethod
    def get_role_name(self) -> str:
        """Get the name of this role."""
        pass 


class OwnerPermissionStrategy(PermissionStrategy):
    """
    Permission strategy for the Owner role.
    
    Owners have full access to all features and permissions.
    This strategy grants all permissions without restriction.
    """
    
    # All available permissions in the system (as defined by project requirements)
    ALL_PERMISSIONS = {
        "canEdit",
        "canLock",
        "canView",
        "canInvite",
        "canApproveLock",
        "canRequestLock",
        "canDeleteProject",
        "canManageMembers",
        "canTransferOwnership",  # Only owners can transfer ownership
        "canManageRoles",
        "canViewAnalytics",
    }
    
    def has_permission(self, permission: str, context: PermissionContext) -> bool:
        """Owners have all permissions."""
        return permission in self.ALL_PERMISSIONS
    
    def get_all_permissions(self, context: PermissionContext) -> Set[str]:
        """Return all available permissions."""
        return self.ALL_PERMISSIONS.copy()
    
    def get_role_name(self) -> str:
        return "owner"


class AdminPermissionStrategy(PermissionStrategy):
    """
    Permission strategy for the Admin role.
    
    Admins have broad permissions including member management but
    cannot delete the project or manage roles.
    """
    
    ADMIN_PERMISSIONS = {
        "canEdit",
        "canLock",
        "canView",
        "canInvite",
        "canApproveLock",
        "canRequestLock",
        "canManageMembers",
        # Explicitly exclude canDeleteProject and canManageRoles
    }
    
    def has_permission(self, permission: str, context: PermissionContext) -> bool:
        """Check if admin has the specific permission."""
        return permission in self.ADMIN_PERMISSIONS
    
    def get_all_permissions(self, context: PermissionContext) -> Set[str]:
        """Return all admin permissions."""
        return self.ADMIN_PERMISSIONS.copy()
    
    def get_role_name(self) -> str:
        return "admin"


class EditorPermissionStrategy(PermissionStrategy):
    """
    Permission strategy for the Editor role.
    
    Editors can modify content but cannot manage users or project settings.
    """
    
    EDITOR_PERMISSIONS = {
        "canEdit",
        "canLock",
        "canView",
        "canRequestLock",
        # No invites, approvals, deletions, or member management
    }
    
    def has_permission(self, permission: str, context: PermissionContext) -> bool:
        """Check if editor has the specific permission."""
        return permission in self.EDITOR_PERMISSIONS
    
    def get_all_permissions(self, context: PermissionContext) -> Set[str]:
        """Return all editor permissions."""
        return self.EDITOR_PERMISSIONS.copy()
    
    def get_role_name(self) -> str:
        return "editor"


class ViewerPermissionStrategy(PermissionStrategy):
    """
    Permission strategy for the Viewer role.
    
    Viewers can only view content and request locks for editing.
    """
    
    VIEWER_PERMISSIONS = {
        "canView",
        "canRequestLock",
    }
    
    def has_permission(self, permission: str, context: PermissionContext) -> bool:
        """Check if viewer has the specific permission."""
        return permission in self.VIEWER_PERMISSIONS
    
    def get_all_permissions(self, context: PermissionContext) -> Set[str]:
        """Return all viewer permissions."""
        return self.VIEWER_PERMISSIONS.copy()
    
    def get_role_name(self) -> str:
        return "viewer"


class DataDrivenPermissionStrategy(PermissionStrategy):
    """
    Data-driven permission strategy that reads permissions from a configuration.
    
    This strategy combines the Strategy pattern with data-driven configuration,
    allowing permissions to be stored in the database or config files.
    """
    
    def __init__(self, role_name: str, permissions: Dict[str, bool]):
        """
        Initialize with role name and permissions map.
        
        Args:
            role_name: Name of the role
            permissions: Dictionary mapping permission names to boolean values
        """
        self.role_name = role_name
        self.permissions = permissions or {}
    
    def has_permission(self, permission: str, context: PermissionContext) -> bool:
        """Check permission from the data-driven configuration."""
        return bool(self.permissions.get(permission, False))
    
    def get_all_permissions(self, context: PermissionContext) -> Set[str]:
        """Return all granted permissions from configuration."""
        return {perm for perm, granted in self.permissions.items() if granted}
    
    def get_role_name(self) -> str:
        return self.role_name


class PermissionStrategyFactory:
    """
    Factory for creating permission strategies.
    
    This factory creates the appropriate strategy based on the role name,
    with fallback to data-driven strategy for custom roles.
    """
    
    # Registry of built-in role strategies
    BUILT_IN_STRATEGIES = {
        "owner": OwnerPermissionStrategy,
        "admin": AdminPermissionStrategy,
        "editor": EditorPermissionStrategy,
        "viewer": ViewerPermissionStrategy,
    }
    
    @classmethod
    def create_strategy(
        cls, 
        role_name: str, 
        role_permissions: Optional[Dict[str, bool]] = None
    ) -> PermissionStrategy:
        """
        Create the appropriate permission strategy for a role.
        
        Args:
            role_name: Name of the role
            role_permissions: Optional permissions map for data-driven roles
            
        Returns:
            PermissionStrategy: The appropriate strategy for the role
        """
        role_name_lower = role_name.lower()
        
        # Use built-in strategy if available
        if role_name_lower in cls.BUILT_IN_STRATEGIES:
            return cls.BUILT_IN_STRATEGIES[role_name_lower]()
        
        # Fall back to data-driven strategy for custom roles
        return DataDrivenPermissionStrategy(role_name, role_permissions or {})


class PermissionEvaluator:
    """
    Context class that uses permission strategies to evaluate permissions.
    
    This is the Context in the Strategy pattern - it maintains a reference
    to a strategy object and delegates permission checking to it.
    """
    
    def __init__(self, strategy: PermissionStrategy):
        """Initialize with a permission strategy."""
        self._strategy = strategy
    
    def set_strategy(self, strategy: PermissionStrategy) -> None:
        """Change the permission strategy at runtime."""
        self._strategy = strategy
    
    def has_permission(self, permission: str, context: PermissionContext) -> bool:
        """Delegate permission check to the current strategy."""
        return self._strategy.has_permission(permission, context)
    
    def get_all_permissions(self, context: PermissionContext) -> Set[str]:
        """Get all permissions from the current strategy."""
        return self._strategy.get_all_permissions(context)
    
    def get_permissions_map(self, context: PermissionContext, permissions_to_check: Optional[Set[str]] = None) -> Dict[str, bool]:
        """
        Get a map of permissions to their granted status.
        
        Args:
            context: Permission context
            permissions_to_check: Specific permissions to check, or None for all known permissions
            
        Returns:
            Dict mapping permission names to boolean granted status
        """
        if permissions_to_check is None:
            # Use the canonical permission set for this project
            permissions_to_check = {
                "canEdit", "canLock", "canView", "canInvite", "canApproveLock",
                "canRequestLock", "canDeleteProject", "canManageMembers", "canTransferOwnership",
            }
        
        return {
            permission: self.has_permission(permission, context)
            for permission in permissions_to_check
        }
    
    def get_role_name(self) -> str:
        """Get the name of the current role."""
        return self._strategy.get_role_name()


# Convenience function for creating evaluators
def create_permission_evaluator(role_name: str, role_permissions: Optional[Dict[str, bool]] = None) -> PermissionEvaluator:
    """
    Create a permission evaluator for the given role.
    
    Args:
        role_name: Name of the role
        role_permissions: Optional permissions map for data-driven roles
        
    Returns:
        PermissionEvaluator configured with the appropriate strategy
    """
    strategy = PermissionStrategyFactory.create_strategy(role_name, role_permissions)
    return PermissionEvaluator(strategy)
