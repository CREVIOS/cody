# Design Patterns Analysis Report

This document provides a comprehensive analysis of design patterns implemented in the codebase, based on careful examination of the actual code.

## Summary

**Total Patterns Found: 11**
- **Creational Patterns: 3**
- **Structural Patterns: 1**
- **Behavioral Patterns: 7**

---

## CREATIONAL PATTERNS

### 1. Factory Method Pattern ✅ **FULLY IMPLEMENTED**

**Location:** `Backend/factories/router_factory.py`

**Implementation Details:**
- **Creator:** `RouterFactory` class
- **Factory Method:** `create_router()` method
- **Products:** `APIRouter` instances from different router modules
- **Concrete Creators:** The factory itself acts as the creator, creating routers from discovered modules

**Key Components:**
- `RouterFactory` class: Main factory class that discovers and creates routers
- `create_router(module_name)`: Factory method that creates router instances
- `discover_routers()`: Discovers router modules automatically
- `register_all_routers()`: Orchestrates the creation and registration process

**Usage:**
- Used in `Backend/main.py` (line 188-189) to automatically register all API routers
- Eliminates manual router registration (previously required 13+ import and registration lines)

**Files:**
- `Backend/factories/router_factory.py` (266 lines)
- `Backend/factories/__init__.py`
- `Backend/main.py` (uses the factory)
- `Backend/tests/test_router_factory.py` (test suite)

---

### 2. Builder Pattern ✅ **FULLY IMPLEMENTED**

**Location:** `SBackend/services/containerBuilder.js`

**Implementation Details:**
- **Product:** `ContainerConfig` class - complex Docker container configuration object
- **Abstract Builder:** `ContainerBuilderBase` class - defines all construction steps
- **Concrete Builder:** `SandboxContainerBuilder` class - implements specific container type
- **Director:** `ContainerDirector` class - orchestrates construction process

**Key Components:**
- `ContainerConfig`: The complex product being built (Docker container configuration)
- `ContainerBuilderBase`: Abstract builder with all construction methods (setImage, setName, addPortBinding, etc.)
- `SandboxContainerBuilder`: Concrete builder for sandbox containers
- `ContainerDirector`: Director that knows the sequence to build sandbox containers

**Construction Steps:**
- Step-by-step configuration: image, name, hostname, TTY settings, environment variables, security settings, memory limits, CPU limits, network settings, volume binds, port bindings, tmpfs mounts, ulimits, labels

**Usage:**
- Used to build Docker container configurations with complex, multi-step setup
- Allows flexible container configuration without telescoping constructors

**Files:**
- `SBackend/services/containerBuilder.js` (487 lines)

---

### 3. Singleton Pattern ✅ **FULLY IMPLEMENTED**

**Location 1:** `Frontend/app/lib/events/EventBus.ts`

**Implementation Details:**
- Private static `instance` field
- Private constructor to prevent direct instantiation
- Public static `getInstance()` method for accessing the singleton
- Lazy initialization (created on first access)

**Usage:**
- Ensures only one EventBus instance exists across the application
- Exported as `eventBus` singleton for global use

**Location 2:** `SBackend/services/yjsSingleton.js`

**Implementation Details:**
- Ensures Yjs library is imported only once
- Prevents "Yjs already imported" errors
- Exports singleton Yjs instance

**Files:**
- `Frontend/app/lib/events/EventBus.ts` (lines 153-173)
- `SBackend/services/yjsSingleton.js` (18 lines)

---

## STRUCTURAL PATTERNS

### 4. Adapter Pattern ✅ **FULLY IMPLEMENTED**

**Location:** `SBackend/adapters/`

**Implementation Details:**
- **Target Interface:** `StorageAdapter` abstract class - defines the storage interface
- **Adaptee:** `Minio.Client` (external library) and in-memory storage
- **Concrete Adapters:**
  - `MinIOStorageAdapter` - adapts MinIO object storage to StorageAdapter interface
  - `MockStorageAdapter` - adapts in-memory Map storage to StorageAdapter interface
- **Client:** `FileSystemService` - uses StorageAdapter interface without knowing implementation

**Key Components:**
- `StorageAdapter`: Abstract base class defining the storage contract (readFile, writeFile, deleteFile, listFiles, etc.)
- `MinIOStorageAdapter`: Adapts MinIO's bucket/object model to project-relative file paths
- `MockStorageAdapter`: In-memory implementation for testing
- `FileSystemService`: Client that depends on StorageAdapter interface, not concrete implementations

**Adapter Responsibilities:**
- Translates between domain model (projectId, filePath) and storage primitives (bucket, objectName)
- Handles MinIO-specific operations (versioning, metadata, streams)
- Provides consistent interface regardless of underlying storage

**Usage:**
- `FileSystemService` accepts any `StorageAdapter` implementation via dependency injection
- Production uses `MinIOStorageAdapter` for object storage
- Tests use `MockStorageAdapter` for fast, isolated testing
- Enables switching storage backends without changing client code

**Files:**
- `SBackend/adapters/storageAdapter.js` (181 lines - abstract interface)
- `SBackend/adapters/minioStorageAdapter.js` (297 lines - MinIO adapter)
- `SBackend/adapters/mockStorageAdapter.js` (260 lines - mock adapter)
- `SBackend/services/fileSystemService.js` (uses adapters)
- `SBackend/tests/adapter-pattern.test.js` (test suite)

---

## BEHAVIORAL PATTERNS

### 5. Command Pattern ✅ **FULLY IMPLEMENTED**

**Location:** `Frontend/app/lib/commands/`

**Implementation Details:**
- **Command Interface:** `Command` interface in `Command.ts`
- **Concrete Commands:** Multiple command classes implementing the interface
- **Invoker:** `CommandManager` class - manages command execution and history
- **Receiver:** File system service (passed to commands)

**Key Components:**
- `Command` interface: Defines execute(), undo(), redo(), getDescription(), canUndo(), serialize()
- `BaseCommand` abstract class: Provides common command functionality
- `CommandManager`: Manages undo/redo stacks, executes commands
- Concrete Commands:
  - `CreateFileCommand`
  - `DeleteFileCommand`
  - `MoveFileCommand`
  - `RenameFileCommand`
  - `CopyFileCommand`
  - `DuplicateFileCommand`
  - `CreateFolderCommand`
  - `SaveFileCommand`
  - `RestoreVersionCommand`

**Features:**
- Undo/redo functionality
- Command history tracking
- Command serialization for persistence
- Queueing support (for offline operations)

**Files:**
- `Frontend/app/lib/commands/Command.ts` (81 lines)
- `Frontend/app/lib/commands/BaseCommand.ts` (81 lines)
- `Frontend/app/lib/commands/CommandManager.ts` (209 lines)
- `Frontend/app/lib/commands/CreateFileCommand.ts` (75 lines)
- `Frontend/app/lib/commands/DeleteFileCommand.ts`
- `Frontend/app/lib/commands/MoveFileCommand.ts`
- `Frontend/app/lib/commands/RenameFileCommand.ts`
- `Frontend/app/lib/commands/CopyFileCommand.ts`
- `Frontend/app/lib/commands/DuplicateFileCommand.ts`
- `Frontend/app/lib/commands/CreateFolderCommand.ts`
- `Frontend/app/lib/commands/SaveFileCommand.ts`
- `Frontend/app/lib/commands/RestoreVersionCommand.ts`
- `Frontend/app/hooks/useCommandManager.ts` (React hook wrapper)

---

### 6. Strategy Pattern ✅ **FULLY IMPLEMENTED**

**Location 1:** `Backend/services/permission_strategies.py`

**Implementation Details:**
- **Strategy Interface:** `PermissionStrategy` abstract base class
- **Concrete Strategies:**
  - `OwnerPermissionStrategy` - Full permissions
  - `AdminPermissionStrategy` - Broad permissions (no delete/manage roles)
  - `EditorPermissionStrategy` - Edit and lock permissions
  - `ViewerPermissionStrategy` - View and request lock only
  - `DataDrivenPermissionStrategy` - Configurable permissions from data
- **Context:** `PermissionEvaluator` class - uses strategies to evaluate permissions
- **Factory:** `PermissionStrategyFactory` - creates appropriate strategy based on role

**Key Methods:**
- `has_permission(permission, context)` - Check if permission is granted
- `get_all_permissions(context)` - Get all available permissions
- `get_role_name()` - Get role name

**Usage:**
- Used in `Backend/services/permission_enforcer.py` to evaluate user permissions
- Allows runtime switching of permission strategies based on user roles
- Eliminates conditional logic for different roles

**Files:**
- `Backend/services/permission_strategies.py` (330 lines)
- `Backend/services/permission_enforcer.py` (188 lines - uses strategies)

**Location 2:** `SBackend/services/versionRetentionStrategies.js`

**Implementation Details:**
- **Strategy Interface:** `IRetentionStrategy` class
- **Concrete Strategies:**
  - `KeepRecentVersionsStrategy` - Keep N most recent versions
  - `TimeBasedRetentionStrategy` - Keep versions based on time windows
  - `TaggedVersionsStrategy` - Keep tagged/important versions
- **Context:** `VersionRetentionManager` class - uses strategies to manage file version lifecycle

**Key Methods:**
- `filterVersionsToKeep(versions)` - Determine which versions to keep
- `getName()` - Get strategy name for logging
- `setStrategy(strategy)` - Change strategy at runtime

**Usage:**
- Manages file version retention policies
- Allows switching retention strategies at runtime

**Files:**
- `SBackend/services/versionRetentionStrategies.js` (278 lines)

---

### 7. State Pattern ✅ **FULLY IMPLEMENTED**

**Location:** `SBackend/services/containerStates.js`

**Implementation Details:**
- **State Interface:** `ContainerState` abstract base class
- **Concrete States:**
  - `CreatingState` - Container is being created
  - `StoppedState` - Container is stopped/created but not running
  - `RunningState` - Container is running
  - `PausedState` - Container is paused
  - `RemovedState` - Container has been removed
  - `ErrorState` - Container is in error state
- **Context:** `ContainerWrapper` class - maintains current state and delegates operations to state objects

**Key Features:**
- State-specific behavior: Each state implements different behavior for start(), stop(), restart(), remove()
- State transitions: States can transition to other states
- State validation: `canStart()`, `canStop()`, `canRestart()`, `canRemove()` methods
- Lifecycle hooks: `onEnter()`, `onExit()` methods for state transitions

**Usage:**
- Manages Docker container lifecycle states
- Prevents invalid operations (e.g., cannot start a removed container)
- Handles state transitions automatically

**Files:**
- `SBackend/services/containerStates.js` (553 lines)

---

### 8. Observer Pattern ✅ **FULLY IMPLEMENTED**

**Location:** `Frontend/app/lib/events/EventBus.ts`

**Implementation Details:**
- **Subject/Publisher:** `EventBus` class
- **Observer Interface:** `EventHandler<T>` function type
- **Concrete Observers:** Any function that subscribes to events
- **Subscription Mechanism:** `subscribe()` and `unsubscribe()` methods

**Key Components:**
- `EventBus` class: Maintains subscription list, publishes events
- `EventType` enum: Defines all event types (FILE_CREATED, FILE_UPDATED, USER_JOINED, etc.)
- `EventPayload` interface: Base interface for all events
- Subscription management: Track subscriptions, support one-time subscriptions
- Event history: Maintains history of published events

**Features:**
- Publish-subscribe mechanism
- Wildcard subscriptions ("*" for all events)
- One-time subscriptions (auto-unsubscribe after first event)
- Event history tracking
- React hooks integration (`useEventBus`)

**Usage:**
- Used throughout the frontend for loose coupling between components
- Components subscribe to events without knowing about publishers
- Used by CommandManager to notify UI of command stack changes

**Files:**
- `Frontend/app/lib/events/EventBus.ts` (380+ lines)
- `Frontend/app/lib/events/useEventBus.ts` (React hooks)
- `Frontend/app/lib/events/index.ts`

---

### 9. Template Method Pattern ✅ **FULLY IMPLEMENTED**

**Location:** `Frontend/app/lib/projectAPI/BaseAPITemplate.ts`

**Implementation Details:**
- **Abstract Class:** `BaseAPITemplate<TResponse>` abstract class
- **Template Method:** `execute()` - Defines the complete API call algorithm:
  1. Build URL (abstract - `buildURL()`)
  2. Build request options (abstract - `buildOptions()`)
  3. Perform network request (concrete with override capability - `performRequest()`)
  4. Handle errors if response not ok
  5. Parse response (hook with default JSON parsing - `parseResponse()`)
  6. Call success hook (optional - `onSuccess()`)
  7. Return parsed data
- **Primitive Operations:** `buildURL()`, `buildOptions()` - abstract methods
- **Hook Methods:** `parseResponse()`, `onSuccess()`, `onError()`, `getErrorMessage()` - can be overridden

**Key Features:**
- Standardizes API call structure across all endpoints
- Provides default implementations for common operations (JSON parsing, error handling)
- Allows customization through hook methods
- Specialized variants: `BaseAPITemplateWithUser` (adds user context), `BaseAPITemplateSilentFail` (handles network errors gracefully)

**Usage:**
- All API call classes extend `BaseAPITemplate` or its variants
- Used in 50+ API call classes across the projectAPI layer
- Ensures consistent error handling, retry logic, and response parsing

**Files:**
- `Frontend/app/lib/projectAPI/BaseAPITemplate.ts` (250 lines)
- `Frontend/app/lib/projectAPI/ProjectAPI.tsx` (uses template)
- `Frontend/app/lib/projectAPI/UserAPI.tsx` (uses template)
- `Frontend/app/lib/projectAPI/InvitationAPI.tsx` (uses template)
- `Frontend/app/lib/projectAPI/RoleAPI.tsx` (uses template)
- `Frontend/app/lib/projectAPI/FileVersionsAPI.tsx` (uses template)
- `Frontend/app/lib/projectAPI/ProjectMembersAPI.tsx` (uses template)
- `Frontend/app/lib/projectAPI/NotificationsAPI.tsx` (uses template)
- `Frontend/app/lib/projectAPI/PermissionsAPI.tsx` (uses template)
- `Frontend/app/lib/projectAPI/FileTypeAPI.tsx` (uses template)
- `Frontend/app/lib/projectAPI/UtilityFunctions.tsx` (uses template)
- `Frontend/app/lib/projectAPI/__tests__/BaseAPITemplate.test.ts` (test suite)

---

### 10. Memento Pattern ✅ **FULLY IMPLEMENTED**

**Location 1:** `Frontend/app/lib/collaboration/SnapshotManager.ts`

**Implementation Details:**
- **Originator:** `Y.Doc` (Yjs document) - the object whose state is saved
- **Memento:** `Snapshot` interface - captures document state (content, stateVector, update, metadata)
- **Caretaker:** `SnapshotManager` class - manages snapshots (create, store, restore, delete)
- **State Storage:** In-memory Map and optional backend persistence

**Key Components:**
- `Snapshot` interface: Contains document state (id, timestamp, content, stateVector, update, metadata)
- `SnapshotManager` class: Manages snapshot lifecycle
  - `createSnapshot()`: Captures current Y.Doc state
  - `restoreSnapshot()`: Restores document from snapshot
  - `listSnapshots()`: Lists all stored snapshots
  - `deleteSnapshot()`: Removes a snapshot
  - Auto-snapshot: Periodic automatic snapshots

**Features:**
- Captures Yjs document state (CRDT state vector and binary update)
- Automatic periodic snapshots (configurable interval)
- Maximum snapshot limit with automatic cleanup
- Export/import for backend persistence
- Efficient restoration using Yjs binary updates

**Usage:**
- Used in collaborative editing to save document checkpoints
- Enables undo/redo at document level
- Supports version history for collaborative documents
- Can be persisted to backend storage (MinIO)

**Files:**
- `Frontend/app/lib/collaboration/SnapshotManager.ts` (350 lines)

**Location 2:** MinIO Versioning (Memento Pattern)

**Implementation Details:**
- **Originator:** File content - the object whose state is saved
- **Memento:** MinIO object versions - immutable snapshots of file state
- **Caretaker:** MinIO storage system - manages versions (create, retrieve, restore, delete)
- **State Storage:** MinIO bucket with versioning enabled

**Key Components:**
- MinIO versioning: Each file write creates a new version (memento)
- Version metadata: versionId, lastModified, size, etag, isLatest
- Version operations:
  - `getVersions()`: List all versions (mementos) for a file
  - `getVersion()`: Retrieve specific version (memento)
  - `restoreVersion()`: Restore file to a previous version
  - `deleteVersion()`: Remove a specific version

**Features:**
- Immutable version history (mementos cannot be modified)
- Automatic version creation on file writes
- Version metadata tracking (timestamp, size, etc.)
- Restore capability (revert to previous state)
- Version retention policies (via Strategy pattern)

**Usage:**
- File version history in `SBackend/services/fileSystemService.js`
- Used by `SaveFileCommand` for undo/redo functionality
- Enables file version browsing and restoration
- Tested in `SBackend/tests/memento-pattern.test.sh`

**Files:**
- `SBackend/adapters/minioStorageAdapter.js` (versioning methods)
- `SBackend/services/fileSystemService.js` (uses versioning)
- `SBackend/services/collaborationService.js` (creates snapshots)
- `SBackend/tests/memento-pattern.test.sh` (test suite)

---