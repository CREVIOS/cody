'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import type * as Monaco from 'monaco-editor';
import { MonacoBinding } from '../lib/collaboration/MonacoBinding';
import { WebSocketProvider, ConnectionStatus } from '../lib/collaboration/WebSocketProvider';
import type { Awareness } from 'y-protocols/awareness';
import { IndexedDBProvider } from '../lib/collaboration/IndexedDBProvider';
import { CollaborativeUndoManager } from '../lib/collaboration/UndoManager';

/**
 * Collaborative Editor Hook
 *
 * Main hook for enabling CRDT-based collaboration in Monaco Editor.
 * Provides:
 * - Realtime synchronization
 * - Offline support with IndexedDB
 * - Awareness (presence, cursors, selections)
 * - Per-client undo/redo
 * - Automatic reconnection
 */

export interface CollaborativeEditorOptions {
  /**
   * Monaco editor instance
   */
  editor: Monaco.editor.IStandaloneCodeEditor | null;

  /**
   * Document/file ID
   */
  docId: string;

  /**
   * User information
   */
  user: {
    id: string;
    name: string;
    color?: string;
  };

  /**
   * WebSocket server URL
   */
  wsUrl?: string;

  /**
   * Enable offline persistence
   */
  offlineSupport?: boolean;

  /**
   * Enable logging
   */
  logging?: boolean;

  /**
   * Initial content to load into Y.Doc (from backend/MinIO)
   */
  initialContent?: string;

  /**
   * Undo manager options
   */
  undoOptions?: {
    captureTimeout?: number;
  };
}

export interface CollaborativeEditorState {
  /**
   * Connection status
   */
  status: ConnectionStatus;

  /**
   * Whether document is synced
   */
  synced: boolean;

  /**
   * Whether offline cache is loaded
   */
  offlineReady: boolean;

  /**
   * Connected users (from awareness)
   */
  users: Map<number, any>;

  /**
   * Undo/redo state
   */
  canUndo: boolean;
  canRedo: boolean;

  /**
   * Error state
   */
  error: Error | null;
}

export interface CollaborativeEditorActions {
  /**
   * Manually disconnect
   */
  disconnect: () => void;

  /**
   * Manually reconnect
   */
  reconnect: () => void;

  /**
   * Undo last operation
   */
  undo: () => void;

  /**
   * Redo last undone operation
   */
  redo: () => void;

  /**
   * Get current document text
   */
  getText: () => string;

  /**
   * Get Y.Doc snapshot as string (for saving to MinIO)
   */
  getSnapshot: () => string;

  /**
   * Update Y.Doc content directly (for undo/redo version restoration)
   */
  setContent: (content: string) => void;

  /**
   * Get awareness states
   */
  getAwarenessStates: () => Map<number, any>;

  /**
   * Get the Awareness instance
   */
  getAwareness: () => Awareness | null;
}

export function useCollaborativeEditor(
  options: CollaborativeEditorOptions
): [CollaborativeEditorState, CollaborativeEditorActions] {
  // Refs for persistent objects
  const docRef = useRef<Y.Doc | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
  const wsProviderRef = useRef<WebSocketProvider | null>(null);
  const indexedDBProviderRef = useRef<IndexedDBProvider | null>(null);
  const monacoBindingRef = useRef<MonacoBinding | null>(null);
  const undoManagerRef = useRef<CollaborativeUndoManager | null>(null);

  // State
  const [state, setState] = useState<CollaborativeEditorState>({
    status: 'disconnected',
    synced: false,
    offlineReady: false,
    users: new Map(),
    canUndo: false,
    canRedo: false,
    error: null,
  });

  /**
   * Initialize collaboration
   */
  useEffect(() => {
    if (!options.editor || !options.docId) {
      return;
    }

    const editor = options.editor;
    const { docId, user, wsUrl, offlineSupport, logging, undoOptions, initialContent } = options;

    // Create Yjs document
    const doc = new Y.Doc();
    const yText = doc.getText('monaco');

    docRef.current = doc;
    yTextRef.current = yText;

    if (logging) {
      console.log('[Collaboration] Initializing for docId:', docId);
    }

    // Set initial content from backend if provided and Y.Doc is empty
    // This ensures the latest version from MinIO is loaded into CRDT
    if (initialContent !== undefined && initialContent !== null) {
      const currentYText = yText.toString();
      if (!currentYText || currentYText.length === 0) {
        // Only set if Y.Doc is empty (to avoid overwriting synced content)
        yText.insert(0, initialContent);
        if (logging) {
          console.log('[Collaboration] Loaded initial content into Y.Doc:', initialContent.length, 'chars');
        }
      } else if (logging) {
        console.log('[Collaboration] Y.Doc already has content, skipping initial content load');
      }
    }

    // Setup IndexedDB persistence (if enabled)
    let indexedDBProvider: IndexedDBProvider | null = null;
    if (offlineSupport !== false) {
      indexedDBProvider = new IndexedDBProvider(doc, { docId });
      indexedDBProviderRef.current = indexedDBProvider;

      // Wait for offline data to load
      indexedDBProvider.whenSynced().then(() => {
        setState((prev) => ({ ...prev, offlineReady: true }));
      });
    }

    // Setup WebSocket provider
    const wsProvider = new WebSocketProvider(doc, {
      docId,
      user,
      url: wsUrl || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
      logging,
    });

    wsProviderRef.current = wsProvider;

    // Setup Monaco binding
    const monacoBinding = new MonacoBinding({
      editor,
      yText,
      awareness: wsProvider.awareness,
    });

    monacoBindingRef.current = monacoBinding;

    // Setup undo manager
    const undoManager = new CollaborativeUndoManager(yText, {
      captureTimeout: undoOptions?.captureTimeout || 500,
      trackedOrigins: new Set([monacoBinding]),
    });

    undoManagerRef.current = undoManager;

    // Listen to connection status
    const handleStatus = (event: Event) => {
      const status = (event as CustomEvent).detail as ConnectionStatus;
      setState((prev) => ({ ...prev, status }));
      
      // Phase 7: Dev-only logging
      if (logging && process.env.NODE_ENV === 'development') {
        console.log('[Phase 7] WebSocket status changed:', status);
      }
    };

    wsProvider.addEventListener('status', handleStatus);

    // Listen to sync
    const handleSync = () => {
      setState((prev) => ({ ...prev, synced: true }));
      
      // Phase 7: Dev-only logging
      if (logging && process.env.NODE_ENV === 'development') {
        console.log('[Phase 7] WebSocket synced');
      }
    };

    wsProvider.addEventListener('sync', handleSync);

    // Listen to errors
    const handleError = (event: Event) => {
      const error = (event as CustomEvent).detail;
      setState((prev) => ({ ...prev, error }));
      
      // Phase 7: Dev-only logging
      if (logging && process.env.NODE_ENV === 'development') {
        console.error('[Phase 7] WebSocket error:', error);
      }
    };

    wsProvider.addEventListener('error', handleError);

    // Listen to awareness changes
    const handleAwarenessChange = () => {
      const users = new Map(wsProvider.awareness.getStates());
      setState((prev) => ({ ...prev, users }));
    };

    wsProvider.awareness.on('change', handleAwarenessChange);

    // Listen to undo/redo state changes
    const handleUndoStateChange = (data: any) => {
      setState((prev) => ({
        ...prev,
        canUndo: data.canUndo,
        canRedo: data.canRedo,
      }));
    };

    undoManager.on('state-change', handleUndoStateChange);

    // Cleanup
    return () => {
      if (logging) {
        console.log('[Collaboration] Cleaning up for docId:', docId);
      }

      wsProvider.removeEventListener('status', handleStatus);
      wsProvider.removeEventListener('sync', handleSync);
      wsProvider.removeEventListener('error', handleError);
      wsProvider.awareness.off('change', handleAwarenessChange);
      undoManager.off('state-change', handleUndoStateChange);

      monacoBinding.destroy();
      undoManager.destroy();
      wsProvider.destroy();
      indexedDBProvider?.destroy();
      doc.destroy();

      docRef.current = null;
      yTextRef.current = null;
      wsProviderRef.current = null;
      indexedDBProviderRef.current = null;
      monacoBindingRef.current = null;
      undoManagerRef.current = null;
    };
  }, [options.editor, options.docId, options.user.id, options.wsUrl, options.offlineSupport, options.logging, options.initialContent]);

  // Actions
  const disconnect = useCallback(() => {
    wsProviderRef.current?.disconnect();
  }, []);

  const reconnect = useCallback(() => {
    wsProviderRef.current?.reconnect();
  }, []);

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  const getText = useCallback(() => {
    return yTextRef.current?.toString() || '';
  }, []);

  const getSnapshot = useCallback(() => {
    // Serialize Y.Doc content to string for saving
    // This is the canonical snapshot that will be saved to MinIO in Phase 6
    return yTextRef.current?.toString() || '';
  }, []);

  const setContent = useCallback((content: string) => {
    // Phase 6 Step 6: Update Y.Doc content directly (for undo/redo)
    const yText = yTextRef.current;
    if (!yText) {
      console.warn('[Collaboration] Cannot set content: Y.Text not initialized');
      return;
    }
    
    const currentContent = yText.toString();
    if (currentContent === content) {
      // No change needed
      return;
    }
    
    // Replace entire content
    yText.doc?.transact(() => {
      yText.delete(0, currentContent.length);
      yText.insert(0, content);
    });
    
    console.log('[Collaboration] Updated Y.Doc content:', content.length, 'chars');
  }, []);

  const getAwarenessStates = useCallback(() => {
    return wsProviderRef.current?.awareness.getStates() || new Map();
  }, []);

  const getAwareness = useCallback(() => {
    return wsProviderRef.current?.awareness || null;
  }, []);

  const actions: CollaborativeEditorActions = {
    disconnect,
    reconnect,
    undo,
    redo,
    getText,
    getSnapshot,
    setContent,
    getAwarenessStates,
    getAwareness,
  };

  return [state, actions];
}
