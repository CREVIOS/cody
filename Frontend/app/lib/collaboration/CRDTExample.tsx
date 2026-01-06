/**
 * CRDT Implementation Example
 * 
 * Complete example showing how to use all CRDT features:
 * - Real-time collaboration
 * - Offline support
 * - Undo/redo
 * - Snapshots
 * - Error handling
 * - Cursor visualization
 */

'use client';

import { useRef, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useCollaborativeEditor } from '@/hooks/use-collaborative-editor';
import { createSnapshotManager } from './SnapshotManager';
import { createErrorHandler, CRDTErrorType } from './ErrorHandler';
import { RemoteCursors, injectRemoteCursorStyles } from '@/components/collaboration/RemoteCursors';
import { getWsBaseUrl } from '@/lib/config/endpoints';

interface CRDTExampleProps {
  docId: string;
  userId: string;
  userName: string;
  wsUrl?: string;
}

export function CRDTExample({
  docId,
  userId,
  userName,
  wsUrl = getWsBaseUrl(),
}: CRDTExampleProps) {
  const editorRef = useRef<any>(null);
  const [content, setContent] = useState('// Start editing...\n');
  const [snapshots, setSnapshots] = useState<any[]>([]);

  // Initialize CRDT collaboration
  const [collabState, collabActions] = useCollaborativeEditor({
    editor: editorRef.current,
    docId,
    user: {
      id: userId,
      name: userName,
      color: '#FF6B6B',
    },
    wsUrl,
    offlineSupport: true,
    logging: true,
    initialContent: content,
  });

  // Initialize error handler
  const errorHandler = createErrorHandler({
    maxRetries: 5,
    onError: (error) => {
      console.error('CRDT Error:', error);
      // Show user-friendly message
      alert(errorHandler.getUserMessage(error));
    },
    onRecover: (error) => {
      console.log('CRDT Recovered:', error);
      // Notify user
      alert('Connection restored!');
    },
  });

  // Initialize snapshot manager (when doc is ready)
  useEffect(() => {
    if (!collabState.synced) return;

    // Get Y.Doc from collaboration (would need to expose this)
    // For now, this is a conceptual example
    console.log('Document synced, snapshot manager would be initialized here');
  }, [collabState.synced]);

  // Inject cursor styles
  useEffect(() => {
    injectRemoteCursorStyles();
  }, []);

  // Handle editor mount
  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  // Create snapshot
  const handleCreateSnapshot = async () => {
    try {
      const snapshot = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        content: collabActions.getSnapshot(),
        metadata: {
          author: userName,
          description: 'Manual snapshot',
        },
      };

      // Save to backend
      await fetch(`/api/snapshots/${docId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });

      setSnapshots((prev) => [snapshot, ...prev].slice(0, 10));
      alert('Snapshot created!');
    } catch (error) {
      errorHandler.handleError(
        error as Error,
        CRDTErrorType.PERSISTENCE_ERROR
      );
    }
  };

  // Restore snapshot
  const handleRestoreSnapshot = async (snapshotId: string) => {
    try {
      const response = await fetch(`/api/snapshots/${docId}/${snapshotId}`);
      const snapshot = await response.json();

      // Update Y.Doc content
      collabActions.setContent(snapshot.content);
      setContent(snapshot.content);

      alert('Snapshot restored!');
    } catch (error) {
      errorHandler.handleError(
        error as Error,
        CRDTErrorType.SYNC_ERROR
      );
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Status Bar */}
      <div className="bg-gray-100 p-2 flex items-center gap-4 text-sm">
        <div>
          Status: <span className="font-bold">{collabState.status}</span>
        </div>
        <div>
          Synced: <span className="font-bold">{collabState.synced ? 'Yes' : 'No'}</span>
        </div>
        <div>
          Users: <span className="font-bold">{collabState.users.size}</span>
        </div>
        <div>
          Offline Ready: <span className="font-bold">{collabState.offlineReady ? 'Yes' : 'No'}</span>
        </div>

        {/* Undo/Redo */}
        <div className="flex gap-2">
          <button
            onClick={collabActions.undo}
            disabled={!collabState.canUndo}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50"
          >
            Undo
          </button>
          <button
            onClick={collabActions.redo}
            disabled={!collabState.canRedo}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50"
          >
            Redo
          </button>
        </div>

        {/* Snapshot */}
        <button
          onClick={handleCreateSnapshot}
          className="px-3 py-1 bg-green-500 text-white rounded"
        >
          Create Snapshot
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language="javascript"
          value={content}
          onChange={(value) => setContent(value || '')}
          onMount={handleEditorDidMount}
          theme="vs-dark"
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            wordWrap: 'on',
          }}
        />

        {/* Remote Cursors */}
        <RemoteCursors
          editor={editorRef.current}
          awareness={collabActions.getAwareness()}
        />
      </div>

      {/* Snapshots Panel */}
      {snapshots.length > 0 && (
        <div className="bg-gray-50 border-t p-4 max-h-40 overflow-y-auto">
          <h3 className="font-bold mb-2">Snapshots:</h3>
          <div className="space-y-1">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="flex items-center justify-between p-2 bg-white rounded"
              >
                <div>
                  <span className="font-mono text-xs">
                    {new Date(snapshot.timestamp).toLocaleString()}
                  </span>
                  <span className="ml-2 text-sm text-gray-600">
                    {snapshot.metadata?.description || 'No description'}
                  </span>
                </div>
                <button
                  onClick={() => handleRestoreSnapshot(snapshot.id)}
                  className="px-2 py-1 bg-blue-500 text-white text-xs rounded"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {collabState.error && (
        <div className="bg-red-100 border-t border-red-500 p-2 text-sm text-red-800">
          {errorHandler.getUserMessage({
            type: CRDTErrorType.UNKNOWN_ERROR,
            message: collabState.error.message,
            timestamp: Date.now(),
            recoverable: true,
            retryable: true,
          })}
        </div>
      )}
    </div>
  );
}
