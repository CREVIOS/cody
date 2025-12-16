'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Y } from '../lib/collaboration/yjsSingleton';
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
   * Project ID (for server routing)
   */
  projectId?: string;

  /**
   * File path (for file-collab channel)
   */
  filePath?: string;

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
  const currentDocIdRef = useRef<string | null>(null);

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

    // Require user identity before bootstrapping
    if (!options.user || !options.user.id) {
      return;
    }

    const editor = options.editor;
    const { docId, user, wsUrl, offlineSupport, logging, undoOptions, initialContent, projectId, filePath } = options;
    
    // Check if we already have a provider for this docId - prevent duplicate initialization
    if (wsProviderRef.current && currentDocIdRef.current === docId) {
      if (logging) {
        console.log('[Collaboration] Provider already exists for docId:', docId, '- skipping reinit');
      }
      return;
    }
    
    // Update current docId
    currentDocIdRef.current = docId;

    // Cleanup any existing providers first
    if (wsProviderRef.current) {
      if (logging) {
        console.log('[Collaboration] Cleaning up existing WebSocket provider');
      }
      wsProviderRef.current.destroy();
      wsProviderRef.current = null;
    }
    if (monacoBindingRef.current) {
      monacoBindingRef.current.destroy();
      monacoBindingRef.current = null;
    }
    if (indexedDBProviderRef.current) {
      indexedDBProviderRef.current.destroy();
      indexedDBProviderRef.current = null;
    }
    if (docRef.current) {
      docRef.current.destroy();
      docRef.current = null;
    }

    // Create Yjs document
    const doc = new Y.Doc();
    const yText = doc.getText('monaco');
    
    // Safety check: If Yjs document already has content, validate it's not corrupted
    try {
      const existingLength = yText.length;
      const MAX_DOC_LENGTH = 100 * 1024 * 1024; // 100MB
      if (existingLength > MAX_DOC_LENGTH) {
        console.error('[Collaboration] Yjs document too large on creation:', existingLength, 'bytes. Resetting.');
        yText.delete(0, yText.length);
      }
    } catch (e) {
      console.error('[Collaboration] Error checking Yjs document on creation:', e);
      // Document might be corrupted, but we'll continue and let MonacoBinding handle it
    }

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

      // Wait for offline data to load, but validate it's not corrupted
      indexedDBProvider.whenSynced().then(async () => {
        // Validate document size after loading from IndexedDB
        try {
          const docLength = yText.length;
          const MAX_DOC_LENGTH = 10 * 1024 * 1024; // 10MB
          if (docLength > MAX_DOC_LENGTH) {
            console.error('[Collaboration] Document from IndexedDB is corrupted:', docLength, 'bytes. Clearing IndexedDB and document.');
            // Clear corrupted document
            yText.delete(0, yText.length);
            // Clear IndexedDB to prevent reloading corrupted data
            try {
              await indexedDBProvider.clearData();
              console.warn('[Collaboration] Cleared corrupted data from IndexedDB');
            } catch (clearError) {
              console.error('[Collaboration] Failed to clear IndexedDB:', clearError);
            }
          }
        } catch (e) {
          console.error('[Collaboration] Error validating document after IndexedDB load:', e);
        }
        setState((prev) => ({ ...prev, offlineReady: true }));
      }).catch((error) => {
        console.error('[Collaboration] Error loading from IndexedDB:', error);
        setState((prev) => ({ ...prev, offlineReady: true }));
      });
    }

    // Setup WebSocket provider
    const wsProvider = new WebSocketProvider(doc, {
      docId,
      projectId,
      filePath,
      channelType: 'file-collab',
      url: wsUrl || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
      user: {
        id: user.id,
        name: user.name,
        color: user.color,
      },
      logging,
      updateBatchMs: 15,
      awarenessDebounceMs: 16,
    });

    wsProviderRef.current = wsProvider;

    // Setup Monaco binding
    const monacoBinding = new MonacoBinding({
      editor,
      yText,
      awareness: wsProvider.awareness,
    });

    monacoBindingRef.current = monacoBinding;
    
    // Handle corruption detection - destroy everything and recreate
    const handleCorruption = async (event: CustomEvent) => {
      // Prevent multiple corruption handlers from running
      if (currentDocIdRef.current === null || currentDocIdRef.current !== docId) {
        return; // Already handling corruption or docId changed
      }
      
      // Log only once
      if (!(handleCorruption as any)._logged) {
        console.error('[Collaboration] Document corruption detected:', event.detail);
        (handleCorruption as any)._logged = true;
      }
      
      // Mark as corrupted to prevent re-initialization
      const corruptedDocId = currentDocIdRef.current;
      currentDocIdRef.current = null;
      
      // Destroy all providers and bindings
      if (wsProviderRef.current) {
        wsProviderRef.current.destroy();
        wsProviderRef.current = null;
      }
      if (indexedDBProviderRef.current) {
        try {
          await indexedDBProviderRef.current.clearData();
        } catch (e) {
          console.error('[Collaboration] Failed to clear IndexedDB:', e);
        }
        indexedDBProviderRef.current.destroy();
        indexedDBProviderRef.current = null;
      }
      if (monacoBindingRef.current) {
        monacoBindingRef.current.destroy();
        monacoBindingRef.current = null;
      }
      if (undoManagerRef.current) {
        undoManagerRef.current.destroy();
        undoManagerRef.current = null;
      }
      if (docRef.current) {
        docRef.current.destroy();
        docRef.current = null;
      }
      yTextRef.current = null;
      
      console.warn('[Collaboration] Cleared corrupted document:', corruptedDocId);
      setState((prev) => ({ ...prev, status: 'disconnected', offlineReady: false, synced: false }));
      
      // The useEffect will detect currentDocIdRef.current === null and recreate everything
    };
    
    monacoBinding.addEventListener('corruption-detected', handleCorruption as EventListener);

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
      monacoBinding.removeEventListener('corruption-detected', handleCorruption as EventListener);

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
      currentDocIdRef.current = null;
    };
  }, [options.editor, options.docId, options.user?.id, options.wsUrl, options.offlineSupport, options.logging, options.initialContent]);

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
