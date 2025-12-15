# High-Class CRDT Implementation Guide

## Overview

This project implements a production-grade CRDT (Conflict-Free Replicated Data Type) system for real-time collaborative editing using **Yjs**. The implementation provides Google Docs-like collaboration with automatic conflict resolution, offline support, versioning, and comprehensive error handling.

## Architecture

### Core Components

1. **Yjs Singleton** (`yjsSingleton.ts`)
   - Ensures single Yjs import across the application
   - Prevents "Yjs already imported" errors
   - Centralized Yjs module management

2. **WebSocket Provider** (`WebSocketProvider.ts`)
   - Real-time synchronization via WebSocket
   - Automatic reconnection with exponential backoff
   - Message queuing for offline operation
   - Awareness protocol for presence/cursors

3. **Monaco Binding** (`MonacoBinding.ts`)
   - Bidirectional sync between Monaco Editor and Yjs
   - Cursor/selection preservation during remote updates
   - Feedback loop prevention

4. **IndexedDB Provider** (`IndexedDBProvider.ts`)
   - Offline-first persistence
   - Automatic sync when online
   - Fast document loading from cache

5. **Undo Manager** (`UndoManager.ts`)
   - Per-client undo/redo stacks
   - Semantic operation grouping
   - Independent undo history per user

6. **Snapshot Manager** (`SnapshotManager.ts`)
   - Document versioning and snapshots
   - Automatic periodic snapshots
   - Snapshot restoration
   - Integration with backend storage

7. **Error Handler** (`ErrorHandler.ts`)
   - Comprehensive error handling
   - Automatic retry with exponential backoff
   - User-friendly error messages
   - Error recovery tracking

## Usage

### Basic Setup

```typescript
import { useCollaborativeEditor } from '@/hooks/use-collaborative-editor';

function MyEditor() {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  
  const [state, actions] = useCollaborativeEditor({
    editor: editorRef.current,
    docId: 'project-id/file-path',
    user: {
      id: 'user-123',
      name: 'John Doe',
      color: '#FF6B6B',
    },
    wsUrl: 'ws://localhost:3001',
    offlineSupport: true,
    logging: true,
    initialContent: 'Initial file content...',
  });

  // Access document text
  const currentText = actions.getText();

  // Undo/Redo
  actions.undo();
  actions.redo();

  // Get snapshot for saving
  const snapshot = actions.getSnapshot();

  return (
    <div>
      <div>Status: {state.status}</div>
      <div>Synced: {state.synced ? 'Yes' : 'No'}</div>
      <div>Users: {state.users.size}</div>
      <div>Can Undo: {state.canUndo ? 'Yes' : 'No'}</div>
    </div>
  );
}
```

### Advanced: Snapshot Management

```typescript
import { createSnapshotManager } from '@/lib/collaboration/SnapshotManager';

// Create snapshot manager
const snapshotManager = createSnapshotManager(doc, yText, {
  autoSnapshotInterval: 5 * 60 * 1000, // 5 minutes
  maxSnapshots: 10,
  onSnapshot: (snapshot) => {
    // Save to backend (MinIO)
    saveSnapshotToBackend(snapshot);
  },
});

// Create manual snapshot
const snapshot = snapshotManager.createSnapshot({
  version: 1,
  author: 'user-123',
  description: 'Manual save point',
});

// Restore from snapshot
snapshotManager.restoreSnapshot(snapshot.id);

// List all snapshots
const snapshots = snapshotManager.listSnapshots();
```

### Advanced: Error Handling

```typescript
import { createErrorHandler, CRDTErrorType } from '@/lib/collaboration/ErrorHandler';

const errorHandler = createErrorHandler({
  maxRetries: 5,
  baseDelay: 1000,
  onError: (error) => {
    // Show user-friendly message
    showNotification(errorHandler.getUserMessage(error));
  },
  onRecover: (error) => {
    // Notify user that error is resolved
    showNotification('Connection restored!');
  },
});

// Handle errors
try {
  await syncOperation();
} catch (error) {
  const crdtError = errorHandler.handleError(
    error,
    CRDTErrorType.NETWORK_ERROR,
    { operation: 'sync' }
  );
}

// Retry with exponential backoff
await errorHandler.retry(
  async () => await syncOperation(),
  'sync-operation',
  (attempt) => console.log(`Retry attempt ${attempt}`)
);
```

## Features

### ✅ Real-Time Synchronization

- **WebSocket Connection**: Automatic connection to collaboration server
- **Sync Protocol**: Yjs built-in sync protocol for efficient state synchronization
- **Change Broadcasting**: All edits are broadcast to connected clients in real-time
- **Late Join Support**: New clients automatically receive full document state

### ✅ Concurrent Editing

- **No File Locking**: Multiple users can edit simultaneously
- **Automatic Conflict Resolution**: Yjs CRDT handles all conflicts automatically
- **Seamless Merging**: Changes from different users are merged without conflicts
- **Operational Transformation**: Yjs uses operational transformation for conflict-free merging

### ✅ Real-Time Cursor Visualization

- **Cursor Tracking**: Each user's cursor position is tracked via awareness protocol
- **Visual Indicators**: Colored cursors with user names
- **Selection Highlights**: Remote selections are highlighted
- **Smooth Animations**: Cursor movements are animated smoothly

### ✅ Offline Editing Support

- **IndexedDB Persistence**: All changes are saved locally
- **Automatic Sync**: Changes sync automatically when connection is restored
- **Conflict-Free Merge**: Offline changes merge seamlessly with online changes
- **No Data Loss**: All edits are preserved even during network failures

### ✅ Undo/Redo

- **Per-Client Undo Stacks**: Each user has independent undo history
- **Semantic Grouping**: Related operations are grouped together
- **Configurable Timeout**: Operations within a time window are grouped
- **Transaction-Based**: Uses Yjs transaction system for accurate undo/redo

### ✅ Versioning and Snapshots

- **Automatic Snapshots**: Periodic snapshots are created automatically
- **Manual Snapshots**: Users can create snapshots on demand
- **Snapshot Restoration**: Restore document to any previous snapshot
- **Backend Integration**: Snapshots can be saved to MinIO/S3 for long-term storage

### ✅ Error Handling

- **Network Error Recovery**: Automatic retry with exponential backoff
- **Connection Failure Handling**: Graceful degradation with offline mode
- **User-Friendly Messages**: Clear error messages for users
- **Error History**: Track and analyze errors for debugging

## Implementation Details

### Yjs Document Structure

```typescript
const doc = new Y.Doc();
const yText = doc.getText('monaco'); // Text content
const yMeta = doc.getMap('meta');     // Metadata (optional)
```

### WebSocket Protocol

The WebSocket provider uses Yjs sync protocol:
- **Sync Step 1**: Client requests current state
- **Sync Step 2**: Server sends missing updates
- **Update Messages**: Document changes
- **Awareness Messages**: Cursor/selection updates

### Awareness Protocol

Awareness is used for presence information:
```typescript
awareness.setLocalState({
  user: { id, name, color },
  cursor: { line, column, offset },
  selection: { start, end },
});
```

### Offline Persistence

IndexedDB stores:
- Document updates (binary format)
- Snapshot metadata
- Sync state vectors

## Best Practices

1. **Always use Yjs Singleton**: Import Yjs from `yjsSingleton.ts`
2. **Handle Errors Gracefully**: Use `CRDTErrorHandler` for all error handling
3. **Create Snapshots Regularly**: Use automatic snapshots for version history
4. **Monitor Connection Status**: Show connection status to users
5. **Clean Up Resources**: Always destroy providers when components unmount

## Testing

### Manual Testing

1. **Multi-User Editing**:
   - Open same file in multiple tabs
   - Type simultaneously
   - Verify changes appear in real-time

2. **Offline Testing**:
   - Disconnect network
   - Make edits
   - Reconnect
   - Verify changes sync

3. **Error Recovery**:
   - Simulate network failure
   - Verify error messages
   - Verify automatic retry

4. **Snapshot Testing**:
   - Create snapshots
   - Make changes
   - Restore from snapshot
   - Verify document state

## Troubleshooting

### "Yjs already imported" Error

**Solution**: Ensure all files import from `yjsSingleton.ts`

### Changes Not Syncing

**Check**:
- WebSocket connection status
- Network connectivity
- Server logs for errors

### Offline Changes Lost

**Check**:
- IndexedDB is enabled
- Browser storage permissions
- Storage quota limits

### Cursors Not Showing

**Check**:
- Awareness protocol is enabled
- RemoteCursors component is mounted
- CSS styles are injected

## Performance Considerations

- **Update Batching**: Updates are batched every 50ms for efficiency
- **Snapshot Frequency**: Adjust based on document size and update frequency
- **Memory Management**: Old snapshots are automatically cleaned up
- **Garbage Collection**: Yjs GC is enabled for large documents

## Security Considerations

- **Authentication**: WebSocket connections require authentication
- **Authorization**: File access is checked before allowing collaboration
- **Data Validation**: All incoming updates are validated
- **Rate Limiting**: Message rate limiting prevents abuse

## Future Enhancements

- [ ] Collaborative undo/redo (shared undo stack)
- [ ] Document comments and annotations
- [ ] Real-time presence indicators
- [ ] Document sharing and permissions
- [ ] Mobile app support
- [ ] End-to-end encryption

## References

- [Yjs Documentation](https://docs.yjs.dev/)
- [Yjs GitHub](https://github.com/yjs/yjs)
- [CRDT Explained](https://crdt.tech/)

