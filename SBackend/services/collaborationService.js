const { Y } = require('./yjsSingleton');
const { encoding, decoding } = require('lib0');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const messageAwareness = 3;
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { createLogger } = require('./logger');

const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MESSAGES = 50;
const UPDATE_BATCH_INTERVAL_MS = 50;
const AWARENESS_THROTTLE_MS = 50;
const CLIENT_PING_INTERVAL_MS = 25_000;
const CLIENT_IDLE_TIMEOUT_MS = 60_000;
const WS_BACKPRESSURE_THRESHOLD = 1_000_000; // 1 MB buffered
const WS_MAX_QUEUE = 500; // Max queued messages per client
const WS_MAX_MESSAGE_BYTES = 5 * 1024 * 1024; // 5 MB safety cap per frame
const INITIAL_DOC_MAX_CHARS = 5 * 1024 * 1024; // 5M chars safety cap for initial file load

function decodeAwarenessUpdateClientIds(update) {
  const decoder = decoding.createDecoder(update);
  const len = decoding.readVarUint(decoder);
  const present = [];
  const removed = [];

  for (let i = 0; i < len; i++) {
    const clientID = decoding.readVarUint(decoder);
    decoding.readVarUint(decoder); // clock
    let state = null;
    try {
      state = JSON.parse(decoding.readVarString(decoder));
    } catch {
      state = {};
    }
    if (state === null) {
      removed.push(clientID);
    } else {
      present.push(clientID);
    }
  }

  return { present, removed };
}

function storageKeyForDocId(docId) {
  return crypto.createHash('sha256').update(String(docId)).digest('hex');
}

function parseSnapshotTimestamp(filename) {
  const match = /^(\d+)/.exec(filename);
  if (!match) return null;
  const ts = Number(match[1]);
  return Number.isFinite(ts) ? ts : null;
}

function parseUpdateTimestamp(filename) {
  const match = /^(\d+)/.exec(filename);
  if (!match) return null;
  const ts = Number(match[1]);
  return Number.isFinite(ts) ? ts : null;
}

function parseFileDocId(docId) {
  const s = String(docId || '');
  if (!s.startsWith('file:')) return null;
  const rest = s.slice('file:'.length);
  const idx = rest.indexOf(':');
  if (idx <= 0) return null;
  const projectId = rest.slice(0, idx);
  const filePath = rest.slice(idx + 1);
  if (!filePath) return null;
  return { projectId, filePath };
}

class CollaborationRoom extends EventEmitter {
  constructor(docId, persistencePath, options = {}) {
    super();
    this.docId = docId;
    this.storageKey = storageKeyForDocId(docId);
    this.persistencePath = persistencePath;
    this.doc = new Y.Doc();
    this.textName = options.textName || 'monaco';
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.pubSubBridge = options.pubSubBridge || null;
    this.initialContentProvider = options.initialContentProvider || null;
    this.connections = new Map(); // clientId -> { ws, user, rateLimitTracker }
    this.connectionAwareness = new Map(); // clientId -> Set(awareness clientIDs)
    this.updateLog = []; // Array of Uint8Array updates
    this.lastSnapshot = Date.now();

    // Configuration
    this.config = {
      snapshotInterval: options.snapshotInterval || 5 * 60 * 1000, // 5 minutes
      maxUpdatesBeforeSnapshot: options.maxUpdatesBeforeSnapshot || 100,
      gcEnabled: options.gcEnabled !== false,
      rateLimitEnabled: options.rateLimitEnabled !== false,
      batchUpdatesEnabled: options.batchUpdatesEnabled !== false,
      ...options
    };

    // Logger
    this.logger = createLogger({ service: 'CollaborationRoom', docId });

    // Update batching
    this.pendingUpdates = []; // Array of { update, excludeClientIds }
    this.batchTimer = null;
    this.pendingAwarenessClients = new Set();
    this.awarenessTimer = null;
    this.heartbeatTimer = null;

    // Setup listeners
    this.setupDocumentListeners();

    // Load persisted state BEFORE allowing any client sync/updates.
    // IMPORTANT: loadFromDisk applies updates with origin 'persistence' and we do NOT broadcast those;
    // if a client syncs before this finishes, it may see an empty doc and then cause duplicate inserts.
    this._ready = false;
    this.readyPromise = (async () => {
      try {
        await this.loadFromDisk();
        await this.initializeFromSourceIfEmpty();
      } catch (err) {
        this.logger.error('Failed to load persisted state', err);
      } finally {
        this._ready = true;
      }
    })();

    // Metrics
    this.metrics = {
      totalUpdates: 0,
      totalConnections: 0,
      bytesIn: 0,
      bytesOut: 0,
      lastActivity: Date.now(),
      rateLimitViolations: 0,
      batchedUpdates: 0
    };

    this.logger.event('room_created', { config: this.config });

    this.startHeartbeat();
  }

  getStorageDocPath() {
    return path.join(this.persistencePath, this.storageKey);
  }

  getLegacyDocPathIfSafe() {
    // Legacy on-disk layout used docId directly as a directory name.
    // This is unsafe if docId contains path separators or traversal sequences,
    // so only allow it if it resolves within persistencePath.
    const root = path.resolve(this.persistencePath);
    const legacyResolved = path.resolve(this.persistencePath, this.docId);
    if (legacyResolved === root) return null;
    if (!legacyResolved.startsWith(root + path.sep)) return null;
    return legacyResolved;
  }

  setupDocumentListeners() {
    this.doc.on('update', (update, origin) => {
      if (origin !== 'persistence') {
        this.updateLog.push(update);
        this.metrics.totalUpdates++;
        this.metrics.lastActivity = Date.now();
        this.checkSnapshot();
        this.persistUpdate(update).catch(err => {
          this.logger.error('Persist error', err);
        });
      }
    });

    this.awareness.on('change', ({ added, updated, removed }) => {
      const changedClients = added.concat(updated, removed);
      if (changedClients.length > 0) {
        this.scheduleAwarenessBroadcast(changedClients);
      }
    });
  }

  /**
   * Add a client connection to this room
   */
  addConnection(clientId, ws, userInfo) {
    // Initialize rate limit tracker for this client
    const rateLimitTracker = {
      messageCount: 0,
      windowStart: Date.now()
    };

    this.connections.set(clientId, {
      ws,
      user: userInfo,
      rateLimitTracker,
      sendQueue: [],
      lastActivityAt: Date.now(),
      lastPingAt: 0
    });
    this.metrics.totalConnections++;

    this.logger.event('client_joined', {
      clientId,
      userName: userInfo.name,
      activeConnections: this.connections.size,
    });

    this.logger.metric('active_connections', this.connections.size, 'count');

    // Setup message handler ASAP (clients may send sync immediately on open)
    ws.on('message', (message, isBinary) => this.handleMessage(clientId, message, isBinary));
    ws.on('pong', () => {
      const conn = this.connections.get(clientId);
      if (conn) {
        conn.lastActivityAt = Date.now();
      }
    });

    // Setup close handler
    ws.on('close', () => this.removeConnection(clientId));

    // Setup error handler
    ws.on('error', (err) => {
      this.logger.error('Client WebSocket error', err, { clientId });
      this.removeConnection(clientId);
    });

    this.emit('connection', { clientId, userInfo });

    // Wait for persistence load before doing ANY protocol sync/awareness.
    // This prevents clients from syncing against an empty doc while persisted content is still loading.
    void this.readyPromise.then(() => {
      // Client might have disconnected while we were loading
      if (!this.connections.has(clientId)) return;
      if (ws.readyState !== ws.OPEN) return;

      // Seed awareness so other clients see the user immediately
      // NOTE: We store user awareness state keyed by clientId (connection ID)
      // The client's doc.clientID is different from our connectionId
      try {
        // Ensure awareness is initialized
        if (!this.awareness) {
          this.logger.warn('Awareness not initialized, reinitializing', { clientId });
          this.awareness = new awarenessProtocol.Awareness(this.doc);
        }

        // For now, just send any existing awareness states to the new client
        this.sendAwarenessToClient(ws);
      } catch (err) {
        this.logger.warn('Failed to setup initial awareness for client', {
          clientId,
          error: err.message
        });
      }

      // Send initial sync
      this.sendSyncStep1(ws);

      // Send current awareness state (only if properly initialized)
      this.sendAwarenessToClient(ws);
    });
  }

  async initializeFromSourceIfEmpty() {
    try {
      if (typeof this.initialContentProvider !== 'function') return;

      const yText = this.doc.getText(this.textName);
      const current = yText.toString();
      if (current && current.length > 0) return;

      const parsed = parseFileDocId(this.docId);
      if (!parsed) return;

      const initial = await this.initialContentProvider({
        docId: this.docId,
        projectId: parsed.projectId,
        filePath: parsed.filePath,
      });

      if (typeof initial !== 'string' || initial.length === 0) return;
      if (initial.length > INITIAL_DOC_MAX_CHARS) {
        this.logger.warn('Initial content too large, skipping init', { length: initial.length });
        return;
      }

      // Re-check emptiness in case another initializer ran.
      const currentAfter = yText.toString();
      if (currentAfter && currentAfter.length > 0) return;

      // Insert with a distinct origin so it's persisted. Clients will receive it via sync.
      this.doc.transact(() => {
        yText.insert(0, initial);
      }, 'init');

      this.logger.info('Initialized doc from source', { projectId: parsed.projectId, filePath: parsed.filePath, length: initial.length });
    } catch (err) {
      this.logger.warn('Failed to initialize doc from source', { error: err && err.message ? err.message : String(err) });
    }
  }

  /**
   * Remove a client connection
   */
  removeConnection(clientId) {
    const conn = this.connections.get(clientId);
    if (!conn) return;

    if (conn.flushTimer) {
      clearInterval(conn.flushTimer);
    }

    this.connections.delete(clientId);

    // Remove awareness states for all clientIDs associated with this connection
    const awarenessClients = this.connectionAwareness.get(clientId);
    if (awarenessClients && awarenessClients.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        Array.from(awarenessClients),
        'client disconnected'
      );
    }
    this.connectionAwareness.delete(clientId);

    this.logger.event('client_left', {
      clientId,
      activeConnections: this.connections.size
    });

    this.emit('disconnection', { clientId });

    if (this.connections.size === 0) {
      this.emit('empty');
    }
  }

  /**
   * Check rate limit for a client
   */
  checkRateLimit(clientId) {
    if (!this.config.rateLimitEnabled) {
      return true; // Rate limiting disabled
    }

    const conn = this.connections.get(clientId);
    if (!conn) return false;

    const tracker = conn.rateLimitTracker;
    const now = Date.now();

    // Reset window if expired
    if (now - tracker.windowStart > RATE_LIMIT_WINDOW_MS) {
      tracker.messageCount = 0;
      tracker.windowStart = now;
    }

    // Increment and check
    tracker.messageCount++;

    if (tracker.messageCount > RATE_LIMIT_MAX_MESSAGES) {
      this.metrics.rateLimitViolations++;
      this.logger.warn('Rate limit exceeded', {
        clientId,
        messageCount: tracker.messageCount,
        window: RATE_LIMIT_WINDOW_MS
      });
      return false;
    }

    return true;
  }

  /**
   * Handle incoming WebSocket message with rate limiting
   */
  async handleMessage(clientId, data, isBinary) {
    try {
      // Ensure persisted state is loaded before handling any protocol messages.
      // This avoids applying client updates against an empty doc and then later loading persisted state.
      await this.readyPromise;

      const conn = this.connections.get(clientId);
      if (conn) {
        conn.lastActivityAt = Date.now();
      }

      // Collaboration channels expect binary Yjs frames. Ignore any non-binary frames
      // (e.g. JSON debug payloads) to avoid crashing decode.
      if (isBinary === false) {
        return;
      }

      // Check rate limit
      if (!this.checkRateLimit(clientId)) {
        // Send rate limit error to client
        const conn = this.connections.get(clientId);
        if (conn && conn.ws.readyState === conn.ws.OPEN) {
          const errorMessage = JSON.stringify({
            type: 'error',
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many messages. Max ${RATE_LIMIT_MAX_MESSAGES} per ${RATE_LIMIT_WINDOW_MS}ms.`,
            timestamp: Date.now()
          });
          conn.ws.send(errorMessage);
        }
        return; // Drop the message
      }

      const message = data instanceof Uint8Array ? data : new Uint8Array(data);
      if (!message || message.byteLength < 2) {
        // Drop empty / malformed frames (prevents lib0 decoding errors)
        return;
      }
      if (message.byteLength > WS_MAX_MESSAGE_BYTES) {
        this.metrics.rateLimitViolations++;
        const conn = this.connections.get(clientId);
        if (conn && conn.ws.readyState === conn.ws.OPEN) {
          conn.ws.send(JSON.stringify({
            type: 'error',
            code: 'MESSAGE_TOO_LARGE',
            message: `Message too large. Max ${WS_MAX_MESSAGE_BYTES} bytes.`,
            timestamp: Date.now()
          }));
        }
        return;
      }
      this.metrics.bytesIn += message.byteLength;

      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case syncProtocol.messageYjsSyncStep1:
          this.handleSyncStep1(clientId, decoder);
          break;

        case syncProtocol.messageYjsSyncStep2:
          this.handleSyncStep2(clientId, decoder);
          break;

        case syncProtocol.messageYjsUpdate:
          await this.handleUpdate(clientId, decoder);  // Now async
          break;

        case messageAwareness:
          this.handleAwareness(clientId, decoder);
          break;

        default:
          this.logger.warn('Unknown message type', { messageType });
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      // lib0 decoding throws "Unexpected end of array" for truncated frames; treat as protocol noise.
      if (msg.includes('Unexpected end of array') || msg.includes('Unexpected end')) {
        this.metrics.decodeErrors = (this.metrics.decodeErrors || 0) + 1;
        return;
      }
      this.logger.error('Error handling message', err, { clientId });
    }
  }

  /**
   * Handle sync step 1: client requests current state
   */
  handleSyncStep1(clientId, decoder) {
    const conn = this.connections.get(clientId);
    if (!conn) return;

    // Send sync step 2 as response to client's step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep2);
    syncProtocol.readSyncStep1(decoder, encoder, this.doc);

    this.sendMessage(conn.ws, encoding.toUint8Array(encoder));
  }

  /**
   * Handle sync step 2: server sends missing updates
   */
  handleSyncStep2(clientId, decoder) {
    syncProtocol.readSyncStep2(decoder, this.doc, 'sync');
  }

  async handleUpdate(clientId, decoder) {
    const conn = this.connections.get(clientId);
    if (!conn) {
      this.logger.warn('Update from unknown client', { clientId });
      return;
    }

    // Read the update bytes from the decoder BEFORE applying
    const update = decoding.readVarUint8Array(decoder);
    // Apply the update to the server's doc with origin to prevent re-broadcast
    Y.applyUpdate(this.doc, update, clientId);

    this.emit('doc-update', { docId: this.docId, origin: clientId, update });

    // Publish to cross-instance bridge (if enabled)
    if (this.pubSubBridge?.enabled) {
      this.publishUpdate(update);
    }

    // Broadcast to all OTHER clients (exclude the sender)
    if (this.config.batchUpdatesEnabled) {
      this.queueUpdateForBroadcast(update, [clientId]);
    } else {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
      encoding.writeVarUint8Array(encoder, update);
      this.broadcast(encoding.toUint8Array(encoder), [clientId]);
    }
  }

  /**
   * Queue update for batched broadcast
   */
  queueUpdateForBroadcast(update, excludeClientIds) {
    this.pendingUpdates.push({ update, excludeClientIds });
    this.metrics.batchedUpdates++;

    // Start batch timer if not already running
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushUpdateBatch();
      }, UPDATE_BATCH_INTERVAL_MS);
    }
  }

  /**
   * Flush batched updates
   */
  flushUpdateBatch() {
    if (this.pendingUpdates.length === 0) {
      this.batchTimer = null;
      return;
    }

    const count = this.pendingUpdates.length;

    for (const { update, excludeClientIds } of this.pendingUpdates) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
      encoding.writeVarUint8Array(encoder, update);
      this.broadcast(encoding.toUint8Array(encoder), excludeClientIds);
    }

    this.logger.debug('Flushed update batch', { count });

    this.pendingUpdates = [];
    this.batchTimer = null;
  }

  /**
   * Handle awareness update (presence)
   */
  handleAwareness(clientId, decoder) {
    const update = decoding.readVarUint8Array(decoder);

    awarenessProtocol.applyAwarenessUpdate(
      this.awareness,
      update,
      clientId
    );

    const { present, removed } = decodeAwarenessUpdateClientIds(update);
    if (present.length > 0 || removed.length > 0) {
      let clientSet = this.connectionAwareness.get(clientId);
      if (!clientSet) {
        clientSet = new Set();
        this.connectionAwareness.set(clientId, clientSet);
      }

      for (const id of present) {
        clientSet.add(id);
      }
      for (const id of removed) {
        clientSet.delete(id);
      }
      if (clientSet.size === 0) {
        this.connectionAwareness.delete(clientId);
      }
    }

    if (this.pubSubBridge?.enabled) {
      this.publishAwareness(update, clientId);
    }
  }

  /**
   * Send initial sync to client
   */
  sendSyncStep1(ws) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
    syncProtocol.writeSyncStep1(encoder, this.doc);

    this.sendMessage(ws, encoding.toUint8Array(encoder));
  }

  /**
   * Send awareness state to a specific client
   */
  sendAwarenessToClient(ws) {
    // Guard against uninitialized awareness
    if (!this.awareness) {
      this.logger.warn('Cannot send awareness: awareness not initialized');
      return;
    }

    try {
      const states = this.awareness.getStates();
      if (states.size > 0) {
        const clientIds = Array.from(states.keys());
        const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(this.awareness, clientIds);

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(encoder, awarenessUpdate);

        this.sendMessage(ws, encoding.toUint8Array(encoder));
      }
    } catch (err) {
      this.logger.error('Failed to encode/send awareness update', err);
    }
  }

  /**
   * Broadcast awareness changes
   */
  broadcastAwareness(changedClients) {
    // Guard against uninitialized awareness
    if (!this.awareness) {
      this.logger.warn('Cannot broadcast awareness: awareness not initialized');
      return;
    }

    // Skip if no clients to broadcast to
    if (!changedClients || changedClients.length === 0) {
      return;
    }

    try {
      const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, awarenessUpdate);

      this.broadcast(encoding.toUint8Array(encoder));
    } catch (err) {
      this.logger.error('Failed to encode/broadcast awareness update', err);
    }
  }

  scheduleAwarenessBroadcast(changedClients) {
    changedClients.forEach((id) => this.pendingAwarenessClients.add(id));
    if (this.awarenessTimer) return;

    this.awarenessTimer = setTimeout(() => {
      const toSend = Array.from(this.pendingAwarenessClients);
      this.pendingAwarenessClients.clear();
      this.awarenessTimer = null;
      if (toSend.length > 0) {
        this.broadcastAwareness(toSend);
      }
    }, AWARENESS_THROTTLE_MS);
  }

  /**
   * Broadcast message to all or some clients
   */
  broadcast(message, excludeClientIds = []) {
    const excludeSet = new Set(excludeClientIds);

    for (const [clientId, conn] of this.connections) {
      if (!excludeSet.has(clientId)) {
        this.enqueueSend(conn, message);
      }
    }
  }

  /**
   * Send message to specific WebSocket
   */
  sendMessage(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
      this.metrics.bytesOut += message.byteLength;
    }
  }

  /**
   * Enqueue message with backpressure guard
   */
  enqueueSend(conn, message) {
    const { ws, sendQueue } = conn;

    if (ws.readyState !== ws.OPEN) return;

    // If bufferedAmount is low and queue empty, try immediate send
    if (ws.bufferedAmount < WS_BACKPRESSURE_THRESHOLD && sendQueue.length === 0) {
      try {
        ws.send(message);
        this.metrics.bytesOut += message.byteLength;
        return;
      } catch (err) {
        this.logger.warn('Immediate send failed, queueing', { error: err.message });
      }
    }

    // Queue with cap
    if (sendQueue.length >= WS_MAX_QUEUE) {
      sendQueue.shift(); // drop oldest to keep queue bounded
      this.logger.warn('Dropping oldest queued message due to backpressure', {
        clientId: conn.user?.id || 'unknown'
      });
    }

    sendQueue.push(message);
    this.scheduleFlush(conn);
  }

  scheduleFlush(conn) {
    if (conn.flushTimer) return;

    conn.flushTimer = setInterval(() => {
      const { ws, sendQueue } = conn;
      if (ws.readyState !== ws.OPEN) {
        clearInterval(conn.flushTimer);
        conn.flushTimer = null;
        return;
      }

      // Flush while buffered under threshold
      while (sendQueue.length > 0 && ws.bufferedAmount < WS_BACKPRESSURE_THRESHOLD) {
        const msg = sendQueue.shift();
        try {
          ws.send(msg);
          this.metrics.bytesOut += msg.byteLength;
        } catch (err) {
          this.logger.warn('Failed to flush queued message', { error: err.message });
          break;
        }
      }

      if (sendQueue.length === 0) {
        clearInterval(conn.flushTimer);
        conn.flushTimer = null;
      }
    }, 10); // small tick to drain
  }

  /**
   * Publish Yjs document update to cross-instance bridge
   */
  publishUpdate(update) {
    if (!this.pubSubBridge?.enabled) return;

    // Base64 encode to transport safely
    const payload = {
      type: 'update',
      docId: this.docId,
      update: Buffer.from(update).toString('base64'),
      timestamp: Date.now(),
    };

    this.pubSubBridge.publish(payload);
  }

  /**
   * Publish awareness update to cross-instance bridge
   */
  publishAwareness(update, clientId) {
    if (!this.pubSubBridge?.enabled) return;

    const payload = {
      type: 'awareness',
      docId: this.docId,
      update: Buffer.from(update).toString('base64'),
      clientId,
      timestamp: Date.now(),
    };

    this.pubSubBridge.publish(payload);
  }

  /**
   * Apply remote Yjs update received via pub/sub
   */
  applyRemoteUpdate(update) {
    // Apply with a fixed origin to avoid echo logic
    Y.applyUpdate(this.doc, update, 'remote');

    this.emit('doc-update', { docId: this.docId, origin: 'remote', update });

    // Broadcast to all local clients
    if (this.config.batchUpdatesEnabled) {
      this.queueUpdateForBroadcast(update, []);
    } else {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
      encoding.writeVarUint8Array(encoder, update);
      this.broadcast(encoding.toUint8Array(encoder), []);
    }
  }

  /**
   * Apply remote awareness update received via pub/sub
   */
  applyRemoteAwareness(update) {
    awarenessProtocol.applyAwarenessUpdate(
      this.awareness,
      update,
      'remote'
    );
  }

  /**
   * Check if snapshot is needed
   */
  checkSnapshot() {
    const timeSinceSnapshot = Date.now() - this.lastSnapshot;
    const shouldSnapshot =
      this.updateLog.length >= this.config.maxUpdatesBeforeSnapshot ||
      timeSinceSnapshot >= this.config.snapshotInterval;

    if (shouldSnapshot) {
      this.createSnapshot().catch(err => {
        this.logger.error('Snapshot error', err);
      });
    }
  }

  /**
   * Persist a single update to disk
   */
  async persistUpdate(update) {
    const updatePath = path.join(this.getStorageDocPath(), 'updates');
    await fs.mkdir(updatePath, { recursive: true });

    const timestamp = Date.now();
    const nonce = crypto.randomBytes(4).toString('hex');
    const filename = `${timestamp}-${nonce}.update`;
    const filepath = path.join(updatePath, filename);

    await fs.writeFile(filepath, update);
  }

  /**
   * Create and save a snapshot
   */
  async createSnapshot() {
    const snapshotPath = path.join(this.getStorageDocPath(), 'snapshots');
    await fs.mkdir(snapshotPath, { recursive: true });

    // Create state vector and snapshot
    const stateVector = Y.encodeStateVector(this.doc);
    const snapshot = Y.encodeStateAsUpdate(this.doc);

    const timestamp = Date.now();
    const nonce = crypto.randomBytes(4).toString('hex');
    const filename = `${timestamp}-${nonce}.snapshot`;
    const filepath = path.join(snapshotPath, filename);

    await fs.writeFile(filepath, snapshot);

    // Update metadata
    const metadata = {
      timestamp,
      updateCount: this.metrics.totalUpdates,
      size: snapshot.byteLength
    };

    await fs.writeFile(
      path.join(snapshotPath, `${timestamp}.meta.json`),
      JSON.stringify(metadata, null, 2)
    );

    this.logger.info('Snapshot created', { filename, size: snapshot.byteLength });

    this.updateLog = [];
    this.lastSnapshot = timestamp;

    if (this.config.gcEnabled) {
      this.doc.gc = true;
    }

    await this.cleanupOldSnapshots(10);
  }

  /**
   * Load document state from disk
   */
  async loadFromDisk() {
    const primaryDocPath = this.getStorageDocPath();
    const legacyDocPath = this.getLegacyDocPathIfSafe();
    const candidates = legacyDocPath ? [primaryDocPath, legacyDocPath] : [primaryDocPath];

    try {
      for (const docPath of candidates) {
        try {
          const snapshotPath = path.join(docPath, 'snapshots');
          const snapshots = await fs.readdir(snapshotPath);
          const snapshotFiles = snapshots
            .filter(f => f.endsWith('.snapshot'))
            .map((file) => ({ file, ts: parseSnapshotTimestamp(file) }))
            .filter((entry) => entry.ts !== null)
            .sort((a, b) => b.ts - a.ts);

          if (snapshotFiles.length > 0) {
            const latestSnapshot = snapshotFiles[0].file;
            const snapshotData = await fs.readFile(path.join(snapshotPath, latestSnapshot));
            try {
              Y.applyUpdate(this.doc, snapshotData, 'persistence');
              this.logger.info('Loaded snapshot', { snapshot: latestSnapshot, docPath });
              const snapshotTimestamp = snapshotFiles[0].ts || 0;
              this.lastSnapshot = snapshotTimestamp;
              await this.loadUpdatesAfter(snapshotTimestamp, docPath);
              return;
            } catch (err) {
              this.logger.warn('Snapshot corrupted, skipping', { snapshot: latestSnapshot, error: err.message, docPath });
            }
          }

          // Fallback: attempt to load updates without snapshot
          await this.loadUpdatesAfter(0, docPath);
          // If we loaded anything from legacy path, we’ll start writing future updates/snapshots
          // to the new hashed directory automatically.
          return;
        } catch (err) {
          // Try the next candidate
          if (err && err.code === 'ENOENT') continue;
          throw err;
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('Failed to read snapshots, continuing without persistence', { error: err.message });
      } else {
        this.logger.info('No persisted state found, starting fresh');
      }
    }
  }

  /**
   * Load updates created after a specific timestamp
   */
  async loadUpdatesAfter(timestamp, docPath = this.getStorageDocPath()) {
    try {
      const updatePath = path.join(docPath, 'updates');
      const updates = await fs.readdir(updatePath);

      const relevantUpdates = updates
        .filter(f => f.endsWith('.update'))
        .map((file) => ({ file, ts: parseUpdateTimestamp(file) }))
        .filter((entry) => entry.ts !== null && entry.ts > timestamp)
        .sort((a, b) => {
          if (a.ts !== b.ts) return a.ts - b.ts;
          return a.file.localeCompare(b.file);
        });

      for (const entry of relevantUpdates) {
        const updateFile = entry.file;
        const updateData = await fs.readFile(path.join(updatePath, updateFile));
        try {
          Y.applyUpdate(this.doc, updateData, 'persistence');
          this.updateLog.push(updateData);
        } catch (err) {
          this.logger.warn('Skipping corrupted update', { file: updateFile, error: err.message });
        }
      }

      if (relevantUpdates.length > 0) {
        this.logger.info('Loaded updates', { count: relevantUpdates.length });
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('Failed to read updates, continuing without them', { error: err.message });
      }
    }
  }

  /**
   * Clean up old snapshots, keeping only the most recent N
   */
  async cleanupOldSnapshots(keepCount = 10) {
    try {
      const snapshotPath = path.join(this.getStorageDocPath(), 'snapshots');
      const files = await fs.readdir(snapshotPath);

      const snapshotFiles = files
        .filter(f => f.endsWith('.snapshot'))
        .map((file) => ({ file, ts: parseSnapshotTimestamp(file) }))
        .filter((entry) => entry.ts !== null)
        .sort((a, b) => b.ts - a.ts);

      if (snapshotFiles.length > keepCount) {
        const toDelete = snapshotFiles.slice(keepCount);

        for (const entry of toDelete) {
          const file = entry.file;
          const baseName = file.replace('.snapshot', '');
          await fs.unlink(path.join(snapshotPath, file)).catch(() => {});
          await fs.unlink(path.join(snapshotPath, `${baseName}.meta.json`)).catch(() => {});
        }

        this.logger.info(`Cleaned up ${toDelete.length} old snapshots`);
      }
    } catch (err) {
      this.logger.error('Error cleaning snapshots', err);
    }
  }

  /**
   * Get room metrics
   */
  getMetrics() {
    let totalQueue = 0;
    let maxQueue = 0;

    for (const { sendQueue = [] } of this.connections.values()) {
      totalQueue += sendQueue.length;
      if (sendQueue.length > maxQueue) maxQueue = sendQueue.length;
    }

    return {
      ...this.metrics,
      activeConnections: this.connections.size,
      documentSize: Y.encodeStateAsUpdate(this.doc).byteLength,
      updateLogSize: this.updateLog.length,
      awarenessSize: this.awareness.getStates().size,
      pendingQueueMessages: totalQueue,
      maxQueueMessages: maxQueue
    };
  }

  /**
   * Get current document content as text (for debugging)
   */
  getText() {
    const text = this.doc.getText(this.textName || 'monaco');
    return text.toString();
  }

  /**
   * Cleanup and close room
   */
  async close() {
    // Flush any pending updates
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.flushUpdateBatch();
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Disconnect all clients
    for (const [clientId, { ws }] of this.connections) {
      ws.close();
    }

    this.connections.clear();

    // Save final snapshot
    await this.createSnapshot();

    // Destroy awareness
    this.awareness.destroy();

    // Destroy document
    this.doc.destroy();

    this.logger.info('Room closed');
  }

  startHeartbeat() {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [clientId, conn] of this.connections) {
        const { ws } = conn;
        if (ws.readyState !== ws.OPEN) continue;

        if (now - conn.lastPingAt >= CLIENT_PING_INTERVAL_MS) {
          try {
            ws.ping();
            conn.lastPingAt = now;
          } catch (err) {
            this.logger.warn('Failed to ping client', { clientId, error: err.message });
          }
        }

        if (now - conn.lastActivityAt >= CLIENT_IDLE_TIMEOUT_MS) {
          this.logger.warn('Disconnecting idle client', { clientId });
          try {
            ws.terminate();
          } catch {
            // ignore
          }
          this.removeConnection(clientId);
        }
      }
    }, Math.min(CLIENT_PING_INTERVAL_MS, 10_000));
  }
}

/**
 * Collaboration Service Manager
 *
 * Manages multiple collaboration rooms
 */
class CollaborationService {
  constructor(persistencePath, options = {}) {
    this.persistencePath = persistencePath || path.join(__dirname, '../data/collaboration');
    this.rooms = new Map();
    this.options = options;
    this.pubSubBridge = options.pubSubBridge || null;
    this.logger = createLogger('CollaborationService');

    if (this.pubSubBridge) {
      // Wire incoming cross-instance updates
      this.pubSubBridge.onUpdate = (msg) => this.handlePubSubUpdate(msg);
    }

    // Cleanup interval for idle rooms
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleRooms();
    }, options.roomCleanupInterval || 60 * 1000); // 1 minute

    this.logger.info('Initialized');
  }

  /**
   * Get or create a collaboration room
   */
  getRoom(docId) {
    if (!this.rooms.has(docId)) {
      const room = new CollaborationRoom(docId, this.persistencePath, {
        ...this.options,
        pubSubBridge: this.pubSubBridge
      });

      // Handle room becoming empty
      room.on('empty', () => {
        room._emptyTimestamp = Date.now();
      });

      this.rooms.set(docId, room);
    }

    const room = this.rooms.get(docId);
    delete room._emptyTimestamp; // Clear empty timestamp if room is being used

    return room;
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, docId, clientId, userInfo) {
    const room = this.getRoom(docId);
    room.addConnection(clientId, ws, userInfo);

    return room;
  }

  /**
   * Clean up idle empty rooms
   */
  cleanupIdleRooms() {
    const now = Date.now();
    const idleTimeout = this.options.roomIdleTimeout || 5 * 60 * 1000; // 5 minutes

    for (const [docId, room] of this.rooms) {
      if (room._emptyTimestamp && (now - room._emptyTimestamp) > idleTimeout) {
        this.logger.info(`Closing idle room: ${docId}`);
        room.close().then(() => {
          this.rooms.delete(docId);
        });
      }
    }
  }

  /**
   * Get all room metrics
   */
  getAllMetrics() {
    const metrics = {
      totalRooms: this.rooms.size,
      rooms: {}
    };

    for (const [docId, room] of this.rooms) {
      metrics.rooms[docId] = room.getMetrics();
    }

    return metrics;
  }

  /**
   * Close all rooms and shutdown service
   */
  async close() {
    clearInterval(this.cleanupInterval);

    const closePromises = [];
    for (const [docId, room] of this.rooms) {
      closePromises.push(room.close());
    }

    await Promise.all(closePromises);
    this.rooms.clear();

    this.logger.info('Shut down');
  }

  /**
   * Handle updates received from other instances via pub/sub
   */
  handlePubSubUpdate(msg) {
    if (!msg || !msg.docId || !msg.type) {
      return;
    }

    const room = this.getRoom(msg.docId);
    if (!room) return;

    try {
      const update = msg.update ? Buffer.from(msg.update, 'base64') : null;

      switch (msg.type) {
        case 'update':
          if (update) {
            room.applyRemoteUpdate(update);
          }
          break;
        case 'awareness':
          if (update) {
            room.applyRemoteAwareness(update);
          }
          break;
        default:
          this.logger.warn('Unknown pub/sub message type', { type: msg.type });
      }
    } catch (err) {
      this.logger.error('Failed to process pub/sub update', err);
    }
  }
}

module.exports = { CollaborationService, CollaborationRoom };
