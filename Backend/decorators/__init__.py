"""
Decorators Package

This package contains decorator implementations following the Decorator design pattern.
Decorators add cross-cutting concerns (like permissions, logging, validation) to functions
without modifying their core logic.
"""

from .permissions import (
    require_permission,
    require_resource_permission,
    PermissionDecorator,
    ResourcePermissionDecorator
)

__all__ = [
    "require_permission",
    "require_resource_permission",
    "PermissionDecorator",
    "ResourcePermissionDecorator"
]
