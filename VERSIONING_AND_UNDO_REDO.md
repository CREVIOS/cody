# Versioning and Undo/Redo Implementation

## Overview

File versioning is implemented using MinIO's built-in versioning feature, with undo/redo functionality via the Command Pattern.

## MinIO Versioning

### Setup

1. **Enable versioning on bucket:**
   ```bash
   cd SBackend
   node scripts/enable-versioning.js
   ```

2. **Verify versioning is enabled:**
   ```bash
   curl http://localhost:3001/api/versioning/status
   ```

### How It Works

- Every file update automatically creates a new version in MinIO
- Each version has a unique, immutable version ID
- All versions are preserved and can be retrieved
- Deleted files can be recovered via version history

## Backend Implementation

### FileSystemService Methods

- `listFileVersions(projectId, filePath)` - List all versions of a file
- `getFileVersion(projectId, filePath, versionId)` - Get specific version content
- `restoreFileVersion(projectId, filePath, versionId)` - Restore to previous version
- `getCurrentVersionId(projectId, filePath)` - Get current (latest) version ID
- `deleteFileVersion(projectId, filePath, versionId)` - Delete a specific version

### API Endpoints

- `GET /api/versioning/status` - Get versioning status
- `POST /api/versioning/enable` - Enable versioning
- `GET /api/projects/:projectId/files/versions?path=...` - List file versions
- `GET /api/projects/:projectId/files/version/:versionId?path=...` - Get version content
- `GET /api/projects/:projectId/files/current-version?path=...` - Get current version ID
- `POST /api/projects/:projectId/files/restore` - Restore file to version
- `DELETE /api/projects/:projectId/files/version/:versionId` - Delete version

## Undo/Redo Implementation

### Save Flow

1. User edits file and presses Ctrl+S (or clicks Save)
2. `SaveFileCommand` is created with the new content
3. Command gets current version ID (if file exists) - non-blocking
4. Command saves the file (MinIO creates new version)
5. Command tracks new version ID in background (non-blocking)
6. Command is added to undo stack
7. UI is updated with saved content

### Undo Flow

1. User presses Ctrl+Z
2. CommandManager pops last command from undo stack
3. `SaveFileCommand.undo()` is called
4. Command restores file to previous version using `restoreFileVersion()`
5. UI is updated with previous content
6. Command is moved to redo stack

### Redo Flow

1. User presses Ctrl+Y or Ctrl+Shift+Z
2. CommandManager pops last command from redo stack
3. `SaveFileCommand.redo()` is called (which calls `doExecute()` again)
4. Command saves the content again (creates new version)
5. UI is updated with saved content
6. Command is moved back to undo stack

## Performance Optimizations

### Before Optimization
- Manual Save: 1-2 seconds (2-5 API calls with delays)
- Version ID Retrieval: 500ms-2s+ (listed all versions)

### After Optimization
- Manual Save: ~100-200ms (1 API call, version tracking in background)
- Version ID Retrieval: ~50-100ms (uses `statObject()` instead of listing)

**Key Changes:**
1. `getCurrentVersionId()` now uses `statObject()` instead of `listFileVersions()`
2. Version tracking is non-blocking (happens in background)
3. Content comparison prevents duplicate versions
4. Reduced retry delays (2 retries with 50ms, 100ms delays)

## Save Button Behavior

### States
- **Enabled**: File has unsaved changes (blue background, shows "Save")
- **Disabled**: File is saved (gray, shows "Saved")
- **Saving**: Save in progress (shows "Saving..." with spinner)

### Auto-Save
- Triggers after 3 seconds of inactivity
- Only saves if content actually changed
- Updates button state after successful save
- Prevents multiple simultaneous saves

### State Management
```typescript
openFiles: Map<string, {
  item: FileSystemItem;
  content: string;           // Current editor content
  savedContent: string;      // Last saved content (for comparison)
  isDirty: boolean;          // Whether file has unsaved changes
  isSaving?: boolean;         // Whether save is in progress
}>
```

## Frontend Components

### VersionHistoryPanel
- Timeline view of all file versions
- Version metadata display (date, size, etag)
- Click to preview version content
- One-click restore with confirmation
- "Current" version indicator

### FileInfoBar
- Save button (Ctrl+S / Cmd+S)
- Undo button (Ctrl+Z / Cmd+Z)
- Redo button (Ctrl+Y / Cmd+Shift+Z)
- Shows tooltips with action descriptions
- Disabled states when no actions available

## Testing

### Verify Versioning
```bash
# Create a test file
curl -X POST http://localhost:3001/api/projects/test-project/files/create \
  -H "Content-Type: application/json" \
  -d '{"path":"test.txt","content":"Version 1"}'

# Update it (creates version 2)
curl -X PUT http://localhost:3001/api/projects/test-project/files/update \
  -H "Content-Type: application/json" \
  -d '{"path":"test.txt","content":"Version 2"}'

# List all versions
curl "http://localhost:3001/api/projects/test-project/files/versions?path=test.txt"
```

### Test Undo/Redo
1. Open a file in the editor
2. Make changes and save (Ctrl+S)
3. Press Ctrl+Z - File should restore to previous version
4. Press Ctrl+Y - File should restore to saved version
5. Test multiple saves and undos

## Troubleshooting

### Version ID Not Retrieved
- MinIO may need a moment to process new versions
- SaveFileCommand includes retry logic (2 attempts with 50ms, 100ms delays)
- Check MinIO logs: `docker logs cody-minio`

### Undo/Redo Not Working
1. Check MinIO versioning is enabled: `curl http://localhost:3001/api/versioning/status`
2. Check browser console for errors
3. Verify CommandManager has commands in undo stack
4. Check Network tab for failed API requests

### UI Not Updating
- Check that `onContentUpdate` callback is being called
- Verify `setCurrentFileContent` is being called in FileSystemContext
- Check React DevTools for state updates

## Files Modified

### Backend
- `SBackend/services/fileSystemService.js` - Version methods
- `SBackend/server.js` - API endpoints
- `SBackend/scripts/enable-versioning.js` - Setup script

### Frontend
- `Frontend/app/lib/commands/SaveFileCommand.ts` - Save with version tracking
- `Frontend/app/lib/commands/RestoreVersionCommand.ts` - Version restore
- `Frontend/app/context/FileSystemContext.tsx` - Save/undo/redo integration
- `Frontend/app/components/filesystemeditor/FileInfoBar.tsx` - UI buttons
- `Frontend/app/components/filesystemeditor/FileEditorContent.tsx` - Keyboard shortcuts
- `Frontend/app/components/versions/VersionHistoryPanel.tsx` - Version history UI

