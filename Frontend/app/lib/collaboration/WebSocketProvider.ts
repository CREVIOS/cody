import * as Y from 'yjs';
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
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export class WebSocketProvider extends EventTarget {
  public readonly doc: Y.Doc;
  public readonly awareness: awarenessProtocol.Awareness;
  public readonly docId: string;
  public readonly user: { id: string; name: string; color: string };

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

  constructor(doc: Y.Doc, options: WebSocketProviderOptions) {
    super();

    this.doc = doc;
    this.docId = options.docId;
    this.user = {
      id: options.user.id,
      name: options.user.name,
      color: options.user.color || this.generateRandomColor(),
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

    // Awareness handlers
    this.awarenessUpdateHandler = (changes, origin) => {
      if (origin !== this) {
        return;
      }

      const changedClients = [...changes.added, ...changes.updated, ...changes.removed];

      const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
      this.sendMessage(this.createAwarenessMessage(update));
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
    if (this.ws !== null) {
      return;
    }

    this.setConnectionStatus('connecting');

    const wsUrl = new URL(this.url);
    wsUrl.searchParams.set('type', 'collaboration');
    wsUrl.searchParams.set('projectId', this.docId);
    wsUrl.searchParams.set('docId', this.docId);
    wsUrl.searchParams.set('userId', this.user.id);
    wsUrl.searchParams.set('userName', this.user.name);
    wsUrl.searchParams.set('userColor', this.user.color);

    this.log('Connecting to', wsUrl.toString());

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
    this.reconnectAttempts = 0;

    // Send sync step 1
    this.sendSyncStep1();

    // Send queued messages
    this.flushMessageQueue();

    this.dispatchEvent(new Event('connect'));
  }

  /**
   * Handle WebSocket message
   */
  private handleMessage(event: MessageEvent) {
    try {
      const data = new Uint8Array(event.data);

      // Check if it's JSON (connection confirmation)
      if (event.data instanceof ArrayBuffer) {
        const decoder = decoding.createDecoder(data);
        const messageType = decoding.readVarUint(decoder);

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
      } else if (typeof event.data === 'string') {
        // Handle JSON messages (like connection confirmation)
        const message = JSON.parse(event.data);
        if (message.type === 'collaboration:connected') {
          this.log('Collaboration confirmed:', message);
        }
      }
    } catch (err) {
      console.error('[WSProvider] Error handling message:', err);
    }
  }

  /**
   * Handle sync step 1 from server
   */
  private handleSyncStep1(decoder: decoding.Decoder) {
    // Build response for SyncStep2
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep2);
    // readSyncStep1 writes the reply content into the provided encoder
    syncProtocol.readSyncStep1(decoder, encoder, this.doc);
    this.sendMessage(encoding.toUint8Array(encoder));
  }

  /**
   * Handle sync step 2 from server
   */
  private handleSyncStep2(decoder: decoding.Decoder) {
    syncProtocol.readSyncStep2(decoder, this.doc, this);

    if (!this.synced) {
      this.synced = true;
      this.log('Synced');
      this.dispatchEvent(new Event('sync'));
    }
  }

  /**
   * Handle document update from server
   */
  private handleUpdate(decoder: decoding.Decoder) {
    syncProtocol.readUpdate(decoder, this.doc, this);
  }

  /**
   * Handle awareness update from server
   */
  private handleAwarenessUpdate(decoder: decoding.Decoder) {
    awarenessProtocol.applyAwarenessUpdate(
      this.awareness,
      decoding.readVarUint8Array(decoder),
      this
    );
  }

  /**
   * Handle document updates (send to server)
   */
  private handleDocUpdate = (update: Uint8Array, origin: any) => {
    if (origin !== this) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
      encoding.writeVarUint8Array(encoder, update);

      this.sendMessage(encoding.toUint8Array(encoder));
    }
  };

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
    console.error('[WSProvider] WebSocket error:', error);
    this.dispatchEvent(new CustomEvent('error', { detail: error }));
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

    // Attempt reconnection
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
