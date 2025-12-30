import { Y } from './yjsSingleton';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import { encoding, decoding } from 'lib0';

/** Local message type for awareness envelope (sync uses 0-2 in y-protocols/sync) */
const messageAwareness = 3;

/** Type for awareness 'change' event payload */
type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

/**
 * WebSocket Provider for Yjs
 *
 * Custom WebSocket provider that:
 * - Connects to our collaboration server
 * - Handles sync protocol for CRDT synchronization
 * - Manages awareness for presence/cursors
 * - Implements reconnection with exponential backoff
 * - Supports offline operation with automatic resync
 */

export interface WebSocketProviderOptions {
  /**
   * Document ID for room isolation
   */
  docId: string;

  /**
   * Project ID (used for server routing)
   */
  projectId?: string;

  /**
   * File path (for file-collab channel)
   */
  filePath?: string;

  /**
   * Channel type: 'collaboration' (project doc) or 'file-collab' (per-file doc)
   */
  channelType?: 'collaboration' | 'file-collab';

  /**
   * User information for awareness
   */
  user: {
    id: string;
    name: string;
    color?: string;
  };

  /**
   * WebSocket URL (default: ws://localhost:3001)
   */
  url?: string;

  /**
   * Awareness instance (created if not provided)
   */
  awareness?: awarenessProtocol.Awareness;

  /**
   * Reconnection options
   */
  reconnect?: {
    enabled?: boolean;
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
  };

  /**
   * Enable structured logging
   */
  logging?: boolean;

  /**
   * Batch interval for Yjs updates (ms)
   */
  updateBatchMs?: number;

  /**
   * Debounce for awareness updates (ms)
   */
  awarenessDebounceMs?: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export class WebSocketProvider extends EventTarget {
  public readonly doc: Y.Doc;
  public readonly awareness: awarenessProtocol.Awareness;
  public readonly docId: string;
  public readonly user: { id: string; name: string; color: string };
  private readonly projectId?: string;
  private readonly filePath?: string;
  private readonly channelType: 'collaboration' | 'file-collab';

  private ws: WebSocket | null = null;
  private url: string;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private synced = false;

  // Reconnection
  private reconnectEnabled: boolean;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectBaseDelay: number;
  private reconnectMaxDelay: number;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  // Awareness cleanup
  private awarenessUpdateHandler: (
    changes: AwarenessChange,
    origin: any
  ) => void;
  private windowBeforeUnloadHandler: () => void;

  // Logging
  private logging: boolean;

  // Message queue for offline messages
  private messageQueue: Uint8Array[] = [];
  private pendingUpdates: Uint8Array[] = [];
  private updateFlushTimer: NodeJS.Timeout | null = null;
  private updateBatchMs: number;

  private pendingAwareness: Uint8Array[] = [];
  private awarenessFlushTimer: NodeJS.Timeout | null = null;
  private awarenessDebounceMs: number;
  
  // Error tracking to prevent spam
  private _errorLogged = false;
  private _errorDispatched = false;

  constructor(doc: Y.Doc, options: WebSocketProviderOptions) {
    super();

    this.doc = doc;
    this.docId = options.docId;
    this.projectId = options.projectId;
    this.filePath = options.filePath;
    
    // Validate file-collab requires filePath
    const channelType = options.channelType || (this.filePath ? 'file-collab' : 'collaboration');
    if (channelType === 'file-collab' && !this.filePath) {
      console.warn('[WSProvider] file-collab channel requires filePath - falling back to collaboration channel');
    }
    this.channelType = channelType;
    // Handle undefined user gracefully (fallback for demo users or edge cases)
    const user = options.user || { id: 'anonymous', name: 'Anonymous' };
    this.user = {
      id: user.id || 'anonymous',
      name: user.name || 'Anonymous',
      color: user.color || this.generateRandomColor(),
    };

    this.url = options.url || 'ws://localhost:3001';
    this.logging = options.logging !== false;

    // Setup awareness
    this.awareness = options.awareness || new awarenessProtocol.Awareness(doc);
    this.setLocalAwareness();

    // Reconnection settings
    this.reconnectEnabled = options.reconnect?.enabled !== false;
    this.maxReconnectAttempts = options.reconnect?.maxRetries || 10;
    this.reconnectBaseDelay = options.reconnect?.baseDelay || 1000;
    this.reconnectMaxDelay = options.reconnect?.maxDelay || 30000;
    this.updateBatchMs = options.updateBatchMs ?? 15;
    this.awarenessDebounceMs = options.awarenessDebounceMs ?? 16;

    // Awareness handlers
    this.awarenessUpdateHandler = (changes, origin) => {
      // Only forward LOCAL changes. Remote applies call awareness with origin === this
      if (origin === this) {
        return;
      }

      const changedClients = [...changes.added, ...changes.updated, ...changes.removed];

      const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
      this.queueAwarenessUpdate(update);
    };

    this.awareness.on('change', this.awarenessUpdateHandler);

    // Cleanup awareness on window close
    this.windowBeforeUnloadHandler = () => {
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        [this.doc.clientID],
        'window unload'
      );
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.windowBeforeUnloadHandler);
    }

    // Setup document update handler
    this.doc.on('update', this.handleDocUpdate);

    // Connect
    this.connect();
  }

  /**
   * Set local awareness state
   */
  private setLocalAwareness() {
    this.awareness.setLocalState({
      user: this.user,
      cursor: null,
      selection: null,
    });
  }

  /**
   * Generate random color
   */
  private generateRandomColor(): string {
    const colors = [
      '#FF6B6B',
      '#4ECDC4',
      '#45B7D1',
      '#FFA07A',
      '#98D8C8',
      '#F7DC6F',
      '#BB8FCE',
      '#85C1E2',
      '#F8B739',
      '#52B788',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Log message (if logging enabled)
   */
  private log(...args: any[]) {
    if (this.logging) {
      console.log(`[WSProvider ${this.docId}]`, ...args);
    }
  }

  /**
   * Connect to WebSocket server
   */
  private connect() {
    // Prevent duplicate connections
    if (this.ws !== null && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      this.log('WebSocket already connecting/connected, skipping...');
      return;
    }
    
    // Clear any existing connection
    if (this.ws !== null) {
      try {
        this.ws.close();
      } catch (e) {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.setConnectionStatus('connecting');

    // Ensure we have a valid base URL
    let baseUrl = this.url;
    if (!baseUrl.startsWith('ws://') && !baseUrl.startsWith('wss://')) {
      baseUrl = `ws://${baseUrl}`;
    }
    
    try {
      const wsUrl = new URL(baseUrl);
      wsUrl.searchParams.set('type', this.channelType);
      wsUrl.searchParams.set('projectId', this.projectId || this.docId);
      wsUrl.searchParams.set('docId', this.docId);
      if (this.filePath) {
        wsUrl.searchParams.set('path', this.filePath);
      }
      wsUrl.searchParams.set('userId', this.user.id);
      wsUrl.searchParams.set('userName', this.user.name);
      wsUrl.searchParams.set('userColor', this.user.color);

      this.log('Connecting to', wsUrl.toString());
      this.log('User ID:', this.user.id);

      this.ws = new WebSocket(wsUrl.toString());
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (e) {
      this.log('Error creating WebSocket connection:', e);
      this.setConnectionStatus('disconnected');
      this.dispatchEvent(new CustomEvent('error', { detail: e }));
    }
  }

  /**
   * Handle WebSocket open
   */
  private handleOpen() {
    this.log('Connected successfully to', this.url);
    this.log('Channel type:', this.channelType, '| Doc ID:', this.docId, '| File path:', this.filePath);
    this.setConnectionStatus('connected');
    this.reconnectAttempts = 0; // Reset on successful connection
    this._errorLogged = false; // Reset error flags
    this._errorDispatched = false;
    
    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Send sync step 1
    this.log('Sending sync step 1...');
    this.sendSyncStep1();

    // Send queued messages
    this.flushMessageQueue();

    // CRITICAL: Send initial awareness state when connected
    // This ensures other clients see this user immediately
    try {
      this.setLocalAwareness();
      // Flush any pending awareness updates
      if (this.pendingAwareness.length > 0) {
        this.flushAwarenessQueue();
      }
    } catch (err) {
      this.log('Error sending initial awareness:', err);
    }

    this.dispatchEvent(new Event('connect'));
  }

  /**
   * Handle WebSocket message
   */
  private handleMessage(event: MessageEvent) {
    // Check for error messages from server
    if (typeof event.data === 'string') {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'error') {
          this.log('Server error received:', message.code, message.message);
          // Disable reconnection for authentication and validation errors
          if (message.code === 'AUTH_REQUIRED' || 
              message.code === 'MISSING_FILE_PATH' || 
              message.code === 'MISSING_PROJECT_ID' ||
              message.code === 'INVALID_PROJECT_ID') {
            this.log('Fatal error - disabling reconnection');
            this.reconnectEnabled = false;
          }
          this.dispatchEvent(new CustomEvent('error', { detail: new Error(message.message || message.code) }));
          return;
        }
        // Handle connection confirmation messages
        if (message.type === 'collaboration:connected' || message.type === 'file-collab:connected') {
          this.log('Collaboration confirmed:', message);
          // Dispatch a custom event so the hook knows connection is fully established
          this.dispatchEvent(new Event('collaboration-ready'));
          return;
        }
      } catch {
        // Not JSON, continue with normal processing
      }
      return; // String messages are always JSON, don't process as binary
    }

    // Validate we have binary data
    if (!(event.data instanceof ArrayBuffer) && !(event.data instanceof Uint8Array)) {
      return;
    }

    try {
      const data = event.data instanceof ArrayBuffer
        ? new Uint8Array(event.data)
        : event.data;

      // Validate data is not empty
      if (!data || data.length === 0) {
        this.log('Received empty message, ignoring');
        return;
      }

      // Minimum message size: 1 byte for type + at least some data
      if (data.length < 2) {
        this.log('Message too short:', data.length);
        return;
      }

      // Create decoder
      const decoder = decoding.createDecoder(data);

      // Read message type
      const messageType = decoding.readVarUint(decoder);

      // Handle message based on type
      switch (messageType) {
        case syncProtocol.messageYjsSyncStep1:
          this.handleSyncStep1(decoder);
          break;

        case syncProtocol.messageYjsSyncStep2:
          this.handleSyncStep2(decoder);
          break;

        case syncProtocol.messageYjsUpdate:
          this.handleUpdate(decoder);
          break;

        case messageAwareness:
          this.handleAwarenessUpdate(decoder);
          break;

        default:
          this.log('Unknown message type:', messageType);
      }
    } catch (err) {
      this.log('Error processing message:', err);
      // Don't close connection for processing errors - just log and continue
      // The sync protocol is resilient and will recover
    }
  }

  /**
   * Handle sync step 1 from server
   *
   * Server sends its state vector, we respond with missing updates (sync step 2)
   */
  private handleSyncStep1(decoder: decoding.Decoder) {
    try {
      // Validate decoder has remaining data
      if (decoder.pos >= decoder.arr.length) {
        this.log('Sync step 1: decoder is empty, nothing to process');
        return;
      }

      // Build response for SyncStep2
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep2);

      // readSyncStep1 reads the server's state vector and writes our missing updates
      syncProtocol.readSyncStep1(decoder, encoder, this.doc);

      // Only send if we have data to send
      const message = encoding.toUint8Array(encoder);
      if (message.length > 1) {
        // More than just the message type
        this.sendMessage(message);
      }
    } catch (error) {
      this.log('Error handling sync step 1:', error);
      // Don't throw - allow connection to continue
      // The sync might still work on next attempt
    }
  }

  /**
   * Handle sync step 2 from server
   */
  private handleSyncStep2(decoder: decoding.Decoder) {
    try {
      syncProtocol.readSyncStep2(decoder, this.doc, this);

      if (!this.synced) {
        this.synced = true;
        this.log('Synced');
        this.dispatchEvent(new Event('sync'));
      }
    } catch (error) {
      this.log('Error handling sync step 2:', error);
      // Don't throw - allow connection to continue
    }
  }

  /**
   * Handle document update from server
   */
  private handleUpdate(decoder: decoding.Decoder) {
    try {
      // Validate decoder has data remaining
      if (decoder.pos >= decoder.arr.length) {
        this.log('Decoder exhausted before reading update');
        return;
      }
      
      // Log received update
      const updateSize = decoder.arr.length - decoder.pos;
      this.log('Received update from server:', updateSize, 'bytes');
      
      // Read update with 'this' as origin so handleDocUpdate knows it's from server
      // This prevents echo loops
      syncProtocol.readUpdate(decoder, this.doc, this);
      
      this.log('Applied remote update successfully');
    } catch (error) {
      this.log('Error reading update:', error);
      // Close connection on update errors to prevent corruption
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1003, 'Update decode error');
      }
    }
  }

  /**
   * Handle awareness update from server
   */
  private handleAwarenessUpdate(decoder: decoding.Decoder) {
    try {
      // Validate decoder has data remaining
      if (decoder.pos >= decoder.arr.length) {
        this.log('Decoder exhausted before reading awareness update');
        return;
      }
      awarenessProtocol.applyAwarenessUpdate(
        this.awareness,
        decoding.readVarUint8Array(decoder),
        this
      );
    } catch (error) {
      this.log('Error handling awareness update:', error);
      // Don't throw - awareness updates are not critical
    }
  }

  /**
   * Handle document updates (send to server)
   *
   * CRITICAL: We need to send LOCAL changes to the server, but NOT:
   * - Changes we received FROM the server (to prevent echo loops)
   * - Changes during initial sync
   */
  private handleDocUpdate = (update: Uint8Array, origin: any) => {
    // Skip if origin is this WebSocket provider (changes from server)
    // This prevents echo loops: server -> client -> server -> ...
    if (origin === this) {
      return;
    }

    // Skip if origin is 'persistence' (from IndexedDB loading)
    if (origin === 'persistence') {
      return;
    }

    // Skip if origin is 'sync' or 'remote' (from server sync)
    if (origin === 'sync' || origin === 'remote') {
      return;
    }

    // Skip if origin is another WebSocket provider instance
    if (origin && typeof origin === 'object') {
      if (origin.constructor?.name === 'WebSocketProvider' ||
          (origin as any).ws !== undefined && (origin as any).docId !== undefined) {
        return;
      }
    }

    // Everything else is considered a LOCAL change that should be sent to the server
    // This includes:
    // - MonacoBinding changes (origin is the MonacoBinding instance)
    // - Direct Y.Doc manipulations (origin may be null or undefined for transact() calls)
    // - UndoManager changes

    this.pendingUpdates.push(update);
    if (!this.updateFlushTimer) {
      this.updateFlushTimer = setTimeout(() => this.flushPendingUpdates(), this.updateBatchMs);
    }
  };

  private flushPendingUpdates() {
    this.updateFlushTimer = null;
    if (this.pendingUpdates.length === 0) return;

    const merged = this.pendingUpdates.length === 1
      ? this.pendingUpdates[0]
      : Y.mergeUpdates(this.pendingUpdates);

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
    encoding.writeVarUint8Array(encoder, merged);
    
    const message = encoding.toUint8Array(encoder);
    this.log('Sending update to server:', merged.length, 'bytes (merged from', this.pendingUpdates.length, 'updates)');
    this.sendMessage(message);

    this.pendingUpdates = [];
  }

  /**
   * Send sync step 1 to server
   */
  private sendSyncStep1() {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
    syncProtocol.writeSyncStep1(encoder, this.doc);

    this.sendMessage(encoding.toUint8Array(encoder));
  }

  /**
   * Create awareness message
   */
  private createAwarenessMessage(update: Uint8Array): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, update);
    return encoding.toUint8Array(encoder);
  }

  /**
   * Queue awareness update with debounce (reduces cursor spam)
   */
  private queueAwarenessUpdate(update: Uint8Array) {
    // Only queue if WebSocket is connected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('WebSocket not connected, queuing awareness update');
      this.pendingAwareness.push(update);
      return;
    }

    this.pendingAwareness.push(update);
    if (this.awarenessFlushTimer) return;

    this.awarenessFlushTimer = setTimeout(() => {
      this.flushAwarenessQueue();
    }, this.awarenessDebounceMs);
  }

  /**
   * Flush pending awareness updates
   */
  private flushAwarenessQueue() {
    this.awarenessFlushTimer = null;
    if (this.pendingAwareness.length === 0) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const merged = this.pendingAwareness.length === 1
      ? this.pendingAwareness[0]
      : awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          Array.from(this.awareness.getStates().keys())
        );

    this.pendingAwareness = [];
    this.sendMessage(this.createAwarenessMessage(merged));
  }

  /**
   * Send message to server (or queue if offline)
   */
  private sendMessage(message: Uint8Array) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      // Queue message for later
      this.messageQueue.push(message);
    }
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws.send(message);
      }
    }
  }

  /**
   * Handle WebSocket error
   *
   * Note: WebSocket errors are often transient (network issues, server restart).
   * We allow reconnection unless there's a specific auth error.
   */
  private handleError(error: Event) {
    // Log error only once per connection attempt to avoid spam
    if (!this._errorLogged) {
      this.log('WebSocket error:', error.type);
      this._errorLogged = true;
    }

    // Don't permanently disable reconnection - let handleClose decide based on close code
    // The close event will fire after the error event

    // Dispatch error event (only once)
    if (!this._errorDispatched) {
      this.dispatchEvent(new CustomEvent('error', { detail: { type: error.type } }));
      this._errorDispatched = true;
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(event: CloseEvent) {
    this.log('Disconnected:', event.code, event.reason || '(no reason)');
    this.setConnectionStatus('disconnected');
    this.synced = false;
    this.ws = null;

    this.dispatchEvent(new Event('disconnect'));

    // Don't reconnect on authentication/policy errors
    if (event.code === 1008) {
      this.log('Connection closed due to policy violation - not reconnecting');
      this.reconnectEnabled = false;
      this.dispatchEvent(new Event('reconnect-failed'));
      return;
    }

    // Respect manual disconnects
    if (!this.reconnectEnabled) {
      this.log('Reconnection disabled - not reconnecting');
      return;
    }

    // Close code 1005 means no status code was provided - this is a normal disconnect
    // Close code 1006 means abnormal closure - should reconnect
    // Attempt reconnection for unexpected disconnects
    if (this.reconnectEnabled && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('Max reconnection attempts reached');
      this.dispatchEvent(new Event('reconnect-failed'));
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(
      this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      this.reconnectMaxDelay
    );

    this.reconnectAttempts++;
    this.setConnectionStatus('reconnecting');

    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      // Reset error flags for new connection attempt
      this._errorLogged = false;
      this._errorDispatched = false;
      this.connect();
    }, delay);
  }

  /**
   * Set connection status and emit event
   */
  private setConnectionStatus(status: ConnectionStatus) {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.dispatchEvent(new CustomEvent('status', { detail: status }));
    }
  }

  /**
   * Get current connection status
   */
  public getStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Check if synced with server
   */
  public isSynced(): boolean {
    return this.synced;
  }

  /**
   * Manually disconnect
   */
  public disconnect() {
    this.reconnectEnabled = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.updateFlushTimer) {
      clearTimeout(this.updateFlushTimer);
      this.updateFlushTimer = null;
      this.pendingUpdates = [];
    }

    if (this.awarenessFlushTimer) {
      clearTimeout(this.awarenessFlushTimer);
      this.awarenessFlushTimer = null;
      this.pendingAwareness = [];
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Manually reconnect
   */
  public reconnect() {
    this.disconnect();
    this.reconnectEnabled = true;
    this.reconnectAttempts = 0;
    // Reset error flags for new connection
    this._errorLogged = false;
    this._errorDispatched = false;
    this.connect();
  }

  /**
   * Destroy provider and cleanup
   */
  public destroy() {
    this.disconnect();

    // Remove awareness
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.doc.clientID],
      'provider destroyed'
    );

    this.awareness.off('change', this.awarenessUpdateHandler);

    // Remove window listener
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.windowBeforeUnloadHandler);
    }

    // Remove document listener
    this.doc.off('update', this.handleDocUpdate);

    this.awareness.destroy();
  }
}
