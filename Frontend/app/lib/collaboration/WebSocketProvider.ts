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
    this.channelType = options.channelType || (this.filePath ? 'file-collab' : 'collaboration');
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
      this.ws.close();
      this.ws = null;
    }

    this.setConnectionStatus('connecting');

    // Ensure we have a valid base URL
    let baseUrl = this.url;
    if (!baseUrl.startsWith('ws://') && !baseUrl.startsWith('wss://')) {
      baseUrl = `ws://${baseUrl}`;
    }
    
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
  }

  /**
   * Handle WebSocket open
   */
  private handleOpen() {
    this.log('Connected');
    this.setConnectionStatus('connected');
    this.reconnectAttempts = 0; // Reset on successful connection
    
    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Send sync step 1
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
        if (message.type === 'error' && message.code === 'AUTH_REQUIRED') {
          this.log('Authentication error received - disabling reconnection');
          this.reconnectEnabled = false;
          this.dispatchEvent(new CustomEvent('error', { detail: new Error(message.message) }));
          return;
        }
      } catch {
        // Not JSON, continue with normal processing
      }
    }
    
    // Validate we have binary data
    if (!(event.data instanceof ArrayBuffer) && !(event.data instanceof Uint8Array)) {
      if (typeof event.data === 'string') {
        // Handle JSON messages (like connection confirmation)
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'collaboration:connected') {
            this.log('Collaboration confirmed:', message);
          }
        } catch {
          // Not JSON, ignore
        }
      }
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

      // Create decoder with error handling
      let decoder: decoding.Decoder;
      try {
        decoder = decoding.createDecoder(data);
      } catch (decoderError) {
        this.log('Error creating decoder:', decoderError);
        return;
      }

      // Validate we can read the message type
      let messageType: number;
      try {
        messageType = decoding.readVarUint(decoder);
      } catch (readError) {
        this.log('Error reading message type (corrupted data):', readError);
        // Close connection on corrupted data to prevent further issues
        if (this.ws) {
          this.ws.close(1003, 'Corrupted message received');
        }
        return;
      }

      // Handle message based on type
      try {
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
      } catch (handleError) {
        this.log('Error handling message type', messageType, ':', handleError);
        // Don't close connection for handling errors, just log them
      }
    } catch (err) {
      this.log('Error processing message:', err);
      // Only close connection for critical decoding errors
      if (err instanceof Error && err.message.includes('Unexpected end')) {
        // This is a decoding error - close connection to prevent further corruption
        if (this.ws) {
          this.ws.close(1003, 'Message decoding error');
        }
      }
      this.dispatchEvent(new CustomEvent('error', { detail: err }));
    }
  }

  /**
   * Handle sync step 1 from server
   */
  private handleSyncStep1(decoder: decoding.Decoder) {
    try {
      // Build response for SyncStep2
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep2);
      // readSyncStep1 writes the reply content into the provided encoder
      syncProtocol.readSyncStep1(decoder, encoder, this.doc);
      this.sendMessage(encoding.toUint8Array(encoder));
    } catch (error) {
      this.log('Error handling sync step 1:', error);
      // Don't throw - allow connection to continue
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
      // Read update with 'this' as origin so handleDocUpdate knows it's from server
      // This prevents echo loops
      syncProtocol.readUpdate(decoder, this.doc, this);
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
   */
  private handleDocUpdate = (update: Uint8Array, origin: any) => {
    // CRITICAL: Only send updates from LOCAL user edits
    // Skip ALL updates that came from:
    // 1. This WebSocket provider (server echoes)
    // 2. Any WebSocket provider (server updates)
    // 3. Updates applied via readUpdate (server sync)
    
    // Skip if origin is this provider (we sent it to server, server echoed it back)
    if (origin === this) {
      return;
    }
    
    // Skip if origin is null (happens during initial sync or server updates)
    if (origin === null || origin === undefined) {
      return;
    }
    
    // Skip if origin is a WebSocket provider object
    if (origin && typeof origin === 'object') {
      // Check for WebSocket provider indicators
      if ((origin as any).ws !== undefined || 
          (origin as any).docId !== undefined ||
          (origin as any).doc === this.doc) {
        // This is from WebSocket - don't send it back
        return;
      }
      
      // Check if it's a Monaco binding origin (we want to send these)
      if ((origin as any)._monacoBinding && (origin as any)._isLocalEdit) {
        // This is a local Monaco edit - SEND IT
        this.pendingUpdates.push(update);
        if (!this.updateFlushTimer) {
          this.updateFlushTimer = setTimeout(() => this.flushPendingUpdates(), this.updateBatchMs);
        }
        return;
      }
    }
    
    // For any other origin, be conservative and don't send
    // This prevents unknown origins from causing echo loops
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
    this.sendMessage(encoding.toUint8Array(encoder));

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
   */
  private handleError(error: Event) {
    // Extract more information from the error event
    const errorInfo: any = {
      type: error.type,
      target: error.target,
      timeStamp: error.timeStamp,
    };
    
    // Try to get WebSocket state and URL
    if (this.ws) {
      errorInfo.readyState = this.ws.readyState;
      errorInfo.url = this.ws.url;
      errorInfo.protocol = this.ws.protocol;
      errorInfo.extensions = this.ws.extensions;
    }
    
    // Log with more context (only once per connection to avoid spam)
    if (!this._errorLogged) {
      console.error('[WSProvider] WebSocket error:', {
        ...errorInfo,
        docId: this.docId,
        projectId: this.projectId,
        filePath: this.filePath,
        connectionStatus: this.connectionStatus,
        reconnectAttempts: this.reconnectAttempts,
      });
      this._errorLogged = true;
    }
    
    // PERMANENTLY stop reconnection on any error to prevent infinite loops
    this.reconnectEnabled = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Close the connection if it's still open
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1006, 'WebSocket error');
        }
      } catch (closeError) {
        // Ignore close errors
      }
      this.ws = null;
    }
    
    this.setConnectionStatus('disconnected');
    // Don't dispatch error event repeatedly - only once
    if (!this._errorDispatched) {
      this.dispatchEvent(new CustomEvent('error', { detail: errorInfo }));
      this._errorDispatched = true;
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(event: CloseEvent) {
    this.log('Disconnected:', event.code, event.reason);
    this.setConnectionStatus('disconnected');
    this.synced = false;
    this.ws = null;

    this.dispatchEvent(new Event('disconnect'));

    // Don't reconnect on authentication errors (code 1008) or intentional closes (code 1000)
    if (event.code === 1008 || event.code === 1000) {
      this.log('Connection closed due to auth error or intentional close - not reconnecting');
      this.reconnectEnabled = false;
      this.dispatchEvent(new Event('reconnect-failed'));
      return;
    }

    // Attempt reconnection only for unexpected disconnects
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
