# Command Pattern Implementation

## Overview

The codebase implements the Command Pattern for all file operations, enabling undo/redo functionality with full integration to MinIO file versioning.

## Architecture

### Command Pattern Components

1. **Command Interface** (`Command.ts`)
   - Defines contract: `execute()`, `undo()`, `redo()`, `getDescription()`, `canUndo()`, `serialize()`

2. **Base Command** (`BaseCommand.ts`)
   - Template Method Pattern implementation
   - Manages execution state and prevents double execution
   - Subclasses implement `doExecute()` and `doUndo()`

3. **Concrete Commands** (9 commands)
   - `SaveFileCommand` - Saves files with version tracking
   - `DeleteFileCommand` - Deletes files (stores content for undo)
   - `RenameFileCommand` - Renames files/folders
   - `MoveFileCommand` - Moves files/folders
   - `CopyFileCommand` - Copies files/folders
   - `CreateFileCommand` - Creates new files
   - `CreateFolderCommand` - Creates new folders
   - `DuplicateFileCommand` - Duplicates files
   - `RestoreVersionCommand` - Restores to previous MinIO version

4. **Receiver** (Service Layer)
   - `FileSystemService` (Backend) - MinIO operations
   - `SaveFileService` (Frontend Adapter) - Save operations
   - `VersionService` (Frontend Adapter) - Version operations

5. **Invoker** (`CommandManager.ts`)
   - Manages undo/redo stacks (max 100 commands)
   - Emits state change events
   - Provides `canUndo()`, `canRedo()`, `getUndoDescription()`, `getRedoDescription()`

6. **Client** (`FileSystemContext.tsx`)
   - Creates command instances
   - Passes commands to CommandManager
   - Provides receiver services to commands

## Operations Supported

| Operation | Command | Undo | Redo | Version Integration |
|-----------|---------|------|------|-------------------|
| Save | SaveFileCommand | ✅ | ✅ | ✅ Full |
| Delete | DeleteFileCommand | ✅ | ✅ | ✅ Content stored |
| Move | MoveFileCommand | ✅ | ✅ | N/A |
| Rename | RenameFileCommand | ✅ | ✅ | N/A |
| Copy | CopyFileCommand | ✅ | ✅ | N/A |
| Create File | CreateFileCommand | ✅ | ✅ | ✅ Creates version |
| Create Folder | CreateFolderCommand | ✅ | ✅ | N/A |
| Duplicate | DuplicateFileCommand | ✅ | ✅ | ✅ Creates version |
| Restore Version | RestoreVersionCommand | ✅ | ✅ | ✅ Full |

## Version Integration

### SaveFileCommand
- Gets current version ID before saving (for undo)
- Saves file (MinIO creates new version)
- Tracks new version ID after save (non-blocking)
- Undo: Restores to previous version using `restoreFileVersion()`
- Redo: Saves content again (creates new version)

### DeleteFileCommand
- Stores file content before deletion
- Undo: Recreates file with original content

### RestoreVersionCommand
- Gets current version ID before restoring
- Saves current content for undo
- Restores to target version
- Undo: Restores back to version before restore

## Usage Example

```typescript
import { commandManager, SaveFileCommand } from '@/lib/commands';

// Create service adapter
const saveFileService = {
  getCurrentVersionId: async (projectId, filePath) => { /* ... */ },
  updateFile: async (projectId, filePath, content) => { /* ... */ },
  restoreFileVersion: async (projectId, filePath, versionId) => { /* ... */ }
};

// Execute save command
const command = new SaveFileCommand(
  userId,
  projectId,
  filePath,
  newContent,
  previousContent,
  saveFileService,
  updateContentCallback
);

await commandManager.execute(command);

// Undo
await commandManager.undo();

// Redo
await commandManager.redo();
```

## Design Patterns Used

1. **Command Pattern** - Main pattern for all operations
2. **Template Method Pattern** - BaseCommand defines skeleton
3. **Facade Pattern** - Service adapters simplify MinIO API
4. **Observer Pattern** - EventBus for state change notifications

## Performance Optimizations

- Version ID tracking is non-blocking (background operation)
- Save completes in ~100-200ms (was 1-2s before optimization)
- `getCurrentVersionId()` uses `statObject()` instead of listing all versions
- Content comparison prevents duplicate versions

## Testing

### Manual Testing
1. Create file → Undo → Redo
2. Save file multiple times → Undo multiple times → Redo
3. Delete file → Undo → Verify file restored
4. Restore version → Undo → Verify restored back

### Keyboard Shortcuts
- **Ctrl+S / Cmd+S**: Save file
- **Ctrl+Z / Cmd+Z**: Undo
- **Ctrl+Y / Cmd+Shift+Z**: Redo

## Files

### Frontend
- `Frontend/app/lib/commands/Command.ts` - Command interface
- `Frontend/app/lib/commands/BaseCommand.ts` - Base command class
- `Frontend/app/lib/commands/*Command.ts` - Concrete commands
- `Frontend/app/lib/commands/CommandManager.ts` - Command manager
- `Frontend/app/context/FileSystemContext.tsx` - Client implementation

### Backend
- `SBackend/services/fileSystemService.js` - Receiver implementation
- `SBackend/server.js` - API endpoints

