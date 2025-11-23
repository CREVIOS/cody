# UI Controls Guide - Save, Undo, Redo, Delete

## Overview

This document describes all the UI buttons and events available for file operations in the collaborative code editor.

## File Editor Controls (FileInfoBar)

The `FileInfoBar` component (shown at the top of the file editor) provides the following buttons:

### ✅ Save Button
- **Location**: Top-right of FileInfoBar
- **Label**: "Save" (when modified) or "Saved" (when not modified)
- **Keyboard Shortcut**: `Ctrl+S` (Windows/Linux) or `Cmd+S` (Mac)
- **Behavior**: 
  - Enabled only when file has unsaved changes
  - Uses `SaveFileCommand` to save with version tracking
  - Creates new version in MinIO automatically
- **Tooltip**: "Save file (Ctrl+S)" or "File is saved"

### ✅ Undo Button
- **Location**: Top-right of FileInfoBar (before Save button)
- **Icon**: Undo arrow (↶)
- **Keyboard Shortcut**: `Ctrl+Z` (Windows/Linux) or `Cmd+Z` (Mac)
- **Behavior**:
  - Enabled when there are commands in the undo stack
  - Restores file to previous version from MinIO
  - Works with SaveFileCommand, DeleteFileCommand, etc.
- **Tooltip**: Shows description of what will be undone (e.g., "Save 'app.ts'")

### ✅ Redo Button
- **Location**: Top-right of FileInfoBar (after Undo, before Save)
- **Icon**: Redo arrow (↷)
- **Keyboard Shortcut**: `Ctrl+Y` or `Ctrl+Shift+Z` (Windows/Linux) or `Cmd+Shift+Z` (Mac)
- **Behavior**:
  - Enabled when there are commands in the redo stack
  - Re-applies the last undone command
  - For saves, creates a new version with the saved content
- **Tooltip**: Shows description of what will be redone

### 🔒 Lock Status Indicator
- **Location**: Top-right of FileInfoBar
- **Shows**: Current lock state (Unlocked/Locked/Queued)
- **Request Lock Button**: Appears when file is locked by another user

## File Tree Controls

### Context Menu (Right-Click)
Right-click on any file or folder in the file tree to access:

#### ✅ Delete
- **Action**: Delete file or folder
- **Icon**: 🗑️
- **Behavior**:
  - Shows confirmation dialog
  - Uses `DeleteFileCommand` (undoable!)
  - Closes file if it's currently open
- **Keyboard Shortcut**: None (use context menu)

#### Other Context Menu Options:
- **Rename** (✏️) - Rename file/folder
- **New File** (📄) - Create new file
- **New Folder** (📁) - Create new folder
- **Copy Path** (📋) - Copy full path to clipboard
- **Copy Relative Path** (📋) - Copy relative path to clipboard

## Keyboard Shortcuts Summary

| Action | Windows/Linux | Mac | Location |
|--------|---------------|-----|----------|
| **Save** | `Ctrl+S` | `Cmd+S` | FileInfoBar button |
| **Undo** | `Ctrl+Z` | `Cmd+Z` | FileInfoBar button |
| **Redo** | `Ctrl+Y` or `Ctrl+Shift+Z` | `Cmd+Shift+Z` | FileInfoBar button |
| **Delete** | Right-click → Delete | Right-click → Delete | Context menu |

## Visual Indicators

### Modified Indicator
- **Location**: Left side of FileInfoBar
- **Shows**: "● Modified" when file has unsaved changes
- **Color**: Yellow warning color

### Language Indicator
- **Location**: Top-right of FileInfoBar
- **Shows**: File language (e.g., "JAVASCRIPT", "TYPESCRIPT")
- **Color**: Gray badge

## Button States

### Enabled/Disabled States

**Save Button:**
- ✅ **Enabled**: File has unsaved changes (blue background)
- ❌ **Disabled**: File is saved (gray, disabled)

**Undo Button:**
- ✅ **Enabled**: Commands available in undo stack (hoverable)
- ❌ **Disabled**: No commands to undo (gray, disabled)

**Redo Button:**
- ✅ **Enabled**: Commands available in redo stack (hoverable)
- ❌ **Disabled**: No commands to redo (gray, disabled)

## How It Works

### Save Flow
1. User edits file → Modified indicator appears
2. User clicks Save button (or presses Ctrl+S)
3. `SaveFileCommand` is created and executed
4. Command tracks version IDs before/after save
5. File is saved to MinIO (creates new version)
6. Save button changes to "Saved" (disabled)
7. Command added to undo stack

### Undo Flow
1. User clicks Undo button (or presses Ctrl+Z)
2. `CommandManager` pops last command from undo stack
3. Command's `undo()` method is called
4. For saves: File is restored to previous version from MinIO
5. UI updates with previous content
6. Command moved to redo stack

### Redo Flow
1. User clicks Redo button (or presses Ctrl+Y)
2. `CommandManager` pops last command from redo stack
3. Command's `redo()` method is called
4. For saves: Content is saved again (creates new version)
5. UI updates with saved content
6. Command moved back to undo stack

### Delete Flow
1. User right-clicks file → Selects "Delete"
2. Confirmation dialog appears
3. User confirms → `DeleteFileCommand` is created
4. Command reads file content (for undo)
5. File is deleted from MinIO
6. File is closed if open
7. Command added to undo stack

## Code Locations

### Components
- **FileInfoBar**: `Frontend/app/components/filesystemeditor/FileInfoBar.tsx`
  - Contains Save, Undo, Redo buttons
- **ContextMenu**: `Frontend/app/components/filetree/ContextMenu.tsx`
  - Contains Delete and other file operations
- **FileEditorContent**: `Frontend/app/components/filesystemeditor/FileEditorContent.tsx`
  - Handles keyboard shortcuts

### Commands
- **SaveFileCommand**: `Frontend/app/lib/commands/SaveFileCommand.ts`
- **DeleteFileCommand**: `Frontend/app/lib/commands/DeleteFileCommand.ts`
- **CommandManager**: `Frontend/app/lib/commands/CommandManager.ts`

### Context
- **FileSystemContext**: `Frontend/app/context/FileSystemContext.tsx`
  - Provides `saveFile()` and `deleteItem()` functions

## Testing

### Test Save Button
1. Open a file
2. Make changes
3. Click "Save" button (should be blue/enabled)
4. Button should change to "Saved" (gray/disabled)

### Test Undo Button
1. Save a file
2. Make more changes
3. Save again
4. Click "Undo" button
5. File should restore to previous version
6. Button should show tooltip with action description

### Test Redo Button
1. After undoing, click "Redo" button
2. File should restore to saved version
3. Button should show tooltip with action description

### Test Delete
1. Right-click a file in file tree
2. Click "Delete"
3. Confirm deletion
4. File should be deleted
5. Can undo deletion (file will be restored)

## Accessibility

- All buttons have `aria-label` attributes
- Tooltips show keyboard shortcuts
- Disabled states are visually distinct
- Color contrast meets WCAG guidelines

## Future Enhancements

Potential additions:
- Delete button in FileInfoBar (for currently open file)
- Keyboard shortcut for delete (e.g., `Delete` key)
- Batch operations (delete multiple files)
- Undo/redo history panel
- Visual diff view for versions

