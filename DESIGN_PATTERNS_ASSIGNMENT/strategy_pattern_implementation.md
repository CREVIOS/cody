# Strategy Pattern Implementation for RBAC System

## Overview

This document explains the implementation of the **Strategy Pattern** for the Role-Based Access Control (RBAC) system, replacing the previous Chain of Responsibility approach.

## Why Strategy Pattern is the Right Choice

### Analysis of Other Patterns

Based on the user's analysis, here's why other patterns don't fit:

| Pattern | Why It's Wrong | What You'd Need For It To Fit |
|---------|----------------|--------------------------------|
| **Composite** | Roles aren't part-whole | If roles contained other roles as children |
| **Decorator** | Roles don't stack | If users could have multiple roles simultaneously |
| **Chain of Responsibility** | No sequential handling | If permissions needed hierarchical approval |
| **Observer** | No state changes to broadcast | If role changes needed to notify others |
| **Factory** | No complex construction | If creating roles required complex logic |
| **Template Method** | No shared algorithm | If permission checks had multi-step workflow |

### Why Strategy Pattern is Perfect

✅ **One task**: "What can this user do?"  
✅ **Multiple algorithms**: Each role determines this differently  
✅ **Interchangeable**: Can swap strategies when role changes  
✅ **Encapsulated**: Each role's permissions are self-contained  

## Implementation Architecture

### 1. Strategy Interface

```python
class PermissionStrategy(ABC):
    @abstractmethod
    def has_permission(self, permission: str, context: PermissionContext) -> bool:
        """Check if the role has the specified permission."""
        pass
    
    @abstractmethod
    def get_all_permissions(self, context: PermissionContext) -> Set[str]:
        """Get all permissions available to this role."""
        pass
    
    @abstractmethod
    def get_role_name(self) -> str:
        """Get the name of this role."""
        pass
```

### 2. Concrete Strategies

#### Owner Strategy
- **Permissions**: All permissions (full access)
- **Use Case**: Project owners who created the project
- **Behavior**: Always grants permission if it exists in the system

#### Admin Strategy  
- **Permissions**: Most permissions except project deletion and role management
- **Use Case**: Trusted users who help manage the project
- **Behavior**: Has management permissions but cannot destroy the project

#### Editor Strategy
- **Permissions**: Content editing and viewing permissions
- **Use Case**: Users who create and modify content
- **Behavior**: Can edit content but cannot manage users

#### Viewer Strategy
- **Permissions**: Read-only access with lock request capability
- **Use Case**: Users who need to view content occasionally
- **Behavior**: Minimal permissions for content consumption

#### Data-Driven Strategy
- **Permissions**: Configurable via database/config
- **Use Case**: Custom roles with specific permission sets
- **Behavior**: Reads permissions from external configuration

### 3. Context Class (Permission Evaluator)

```python
class PermissionEvaluator:
    def __init__(self, strategy: PermissionStrategy):
        self._strategy = strategy
    
    def set_strategy(self, strategy: PermissionStrategy) -> None:
        """Change the permission strategy at runtime."""
        self._strategy = strategy
    
    def has_permission(self, permission: str, context: PermissionContext) -> bool:
        """Delegate permission check to the current strategy."""
        return self._strategy.has_permission(permission, context)
```

## Key Benefits Achieved

### 1. Open/Closed Principle
- **Open for extension**: Easy to add new roles
- **Closed for modification**: Existing roles don't change

```python
# Adding a new role doesn't require modifying existing code
class ModeratorPermissionStrategy(PermissionStrategy):
    def has_permission(self, permission: str, context: PermissionContext) -> bool:
        # Custom moderator logic here
        return permission in self.MODERATOR_PERMISSIONS
```

### 2. Runtime Flexibility
```python
# User role can change at runtime
evaluator = PermissionEvaluator(ViewerPermissionStrategy())
# User gets promoted
evaluator.set_strategy(EditorPermissionStrategy())
```

### 3. Encapsulation
Each role strategy encapsulates its own permission logic:
- Owner strategy knows owner permissions
- Admin strategy knows admin permissions  
- No cross-dependencies between strategies

### 4. Eliminates Conditional Logic
**Before (Chain of Responsibility)**:
```python
if role_name.lower() == "owner":
    return PermissionResult(True, reason="Owner has full access")
elif role_name.lower() == "admin":
    # Check admin permissions...
elif role_name.lower() == "editor":
    # Check editor permissions...
```

**After (Strategy Pattern)**:
```python
# No conditionals - strategy handles its own logic
return strategy.has_permission(permission, context)
```

## Integration Points

### 1. Permission Enforcer
```python
async def evaluate_user_permission(
    db: AsyncSession,
    project_id: UUID,
    user_id: UUID,
    permission: str,
) -> PermissionResult:
    # Get user's role
    role = await get_user_role(db, project_id, user_id)
    
    # Create appropriate strategy
    evaluator = create_permission_evaluator(role.role_name, role.permissions)
    
    # Delegate to strategy
    granted = evaluator.has_permission(permission, context)
    return PermissionResult(granted=granted, ...)
```

### 2. API Endpoints
```python
@router.get("/projects/{project_id}")
async def get_user_project_permissions(project_id: UUID, user_id: UUID):
    # Use Strategy pattern to compute all permissions efficiently
    permissions_map = await get_user_permissions_map(
        db, project_id=project_id, user_id=user_id
    )
    return UserProjectPermissions(permissions=permissions_map)
```

### 3. Frontend Integration
The frontend continues to work unchanged - it receives the same permission maps, but now they're computed using the Strategy pattern instead of Chain of Responsibility.

## Data-Driven Approach

The implementation combines Strategy pattern with data-driven configuration:

```python
# Built-in strategies for common roles
BUILT_IN_STRATEGIES = {
    "owner": OwnerPermissionStrategy,
    "admin": AdminPermissionStrategy,
    "editor": EditorPermissionStrategy,
    "viewer": ViewerPermissionStrategy
}

# Fall back to data-driven for custom roles
def create_strategy(role_name: str, role_permissions: Dict[str, bool]):
    if role_name.lower() in BUILT_IN_STRATEGIES:
        return BUILT_IN_STRATEGIES[role_name.lower()]()
    return DataDrivenPermissionStrategy(role_name, role_permissions)
```

This gives you:
- **Pattern benefits**: Encapsulation, flexibility, extensibility
- **Easy configuration**: Non-developers can update permissions in database
- **Best of both worlds**: Structure + flexibility

## Testing Strategy

The implementation includes comprehensive tests that demonstrate:

1. **Individual Strategy Testing**: Each strategy is tested independently
2. **Factory Pattern Testing**: Strategy creation is tested
3. **Runtime Switching**: Role changes at runtime are tested
4. **Pattern Benefits**: Open/Closed Principle and encapsulation are demonstrated

## Migration from Chain of Responsibility

### What Changed
1. **Removed**: `permissions_chain.py` with sequential handlers
2. **Added**: `permission_strategies.py` with role-specific strategies
3. **Updated**: `permission_enforcer.py` to use Strategy pattern
4. **Enhanced**: API endpoints to leverage new pattern

### What Stayed the Same
- Database schema (no changes needed)
- Frontend API contracts (same response format)
- Permission names and structure
- Overall system behavior (just more efficient and maintainable)

## Conclusion

The Strategy pattern implementation provides:

- ✅ **Correct pattern choice**: Matches the problem domain perfectly
- ✅ **Better maintainability**: Each role is self-contained
- ✅ **Improved performance**: No sequential chain traversal
- ✅ **Enhanced flexibility**: Easy to add new roles
- ✅ **Cleaner code**: No complex conditional logic
- ✅ **Better testing**: Each strategy can be tested independently

This implementation follows the Wikipedia definition exactly: "behaviors are defined as separate interfaces and specific classes that implement these interfaces" - your permission strategies are those behaviors, and they're now properly encapsulated and interchangeable.
