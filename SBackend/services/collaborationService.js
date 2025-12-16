const { Y } = require('./yjsSingleton');
const { encoding, decoding } = require('lib0');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const messageAwareness = 3;
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const { createLogger } = require('./logger');

const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MESSAGES = 50;
const UPDATE_BATCH_INTERVAL_MS = 50;
const AWARENESS_THROTTLE_MS = 50;
const WS_BACKPRESSURE_THRESHOLD = 1_000_000; // 1 MB buffered
const WS_MAX_QUEUE = 500; // Max queued messages per client

class CollaborationRoom extends EventEmitter {
  constructor(docId, persistencePath, options = {}) {
    super();
    this.docId = docId;
    this.persistencePath = persistencePath;
    this.doc = new Y.Doc();
    this.textName = options.textName || 'monaco';
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.pubSubBridge = options.pubSubBridge || null;
    this.connections = new Map(); // clientId -> { ws, user, rateLimitTracker }
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

    // Setup listeners
    this.setupDocumentListeners();

    // Load persisted state
    this.loadFromDisk().catch(err => {
      this.logger.error('Failed to load persisted state', err);
    });

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
      sendQueue: []
    });
    this.metrics.totalConnections++;

    this.logger.event('client_joined', {
      clientId,
      userName: userInfo.name,
      activeConnections: this.connections.size,
    });

    this.logger.metric('active_connections', this.connections.size, 'count');

    // Seed awareness so other clients see the user immediately
    // CRITICAL: Use setLocalState to properly initialize awareness.meta
    try {
      // Ensure awareness is initialized before setting state
      if (!this.awareness || !this.awareness.meta) {
        this.logger.warn('Awareness not initialized, reinitializing', { clientId });
        this.awareness = new awarenessProtocol.Awareness(this.doc);
      }
      
      // Use setLocalState instead of directly manipulating states
      // This ensures meta.clock is properly initialized
      this.awareness.setLocalState(clientId, {
        user: {
          id: userInfo.id,
          name: userInfo.name,
          color: userInfo.color
        },
        cursor: null,
        selection: null
      });
      
      // Broadcast only if awareness is properly initialized
      if (this.awareness.meta && this.awareness.meta.clock !== undefined) {
        this.broadcastAwareness([clientId]);
      }
    } catch (err) {
      this.logger.warn('Failed to broadcast initial awareness state', {
        clientId,
        error: err.message
      });
    }

    // Send initial sync
    this.sendSyncStep1(ws);

    // Send current awareness state (only if properly initialized)
    this.sendAwarenessToClient(ws);

    // Setup message handler
    ws.on('message', (message) => this.handleMessage(clientId, message));

    // Setup close handler
    ws.on('close', () => this.removeConnection(clientId));

    // Setup error handler
    ws.on('error', (err) => {
      this.logger.error('Client WebSocket error', err, { clientId });
      this.removeConnection(clientId);
    });

    this.emit('connection', { clientId, userInfo });
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

    // Remove awareness state for the disconnecting client
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [clientId],
      'client disconnected'
    );

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
  async handleMessage(clientId, data) {
    try {
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

      const message = new Uint8Array(data);
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
    // CRITICAL: Guard against uninitialized awareness
    if (!this.awareness || !this.awareness.meta || this.awareness.meta.clock === undefined) {
      this.logger.warn('Cannot send awareness: awareness not initialized', {
        hasAwareness: !!this.awareness,
        hasMeta: !!(this.awareness && this.awareness.meta),
        hasClock: !!(this.awareness && this.awareness.meta && this.awareness.meta.clock !== undefined)
      });
      return;
    }

    const states = this.awareness.getStates();
    if (states.size > 0) {
      try {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys()))
        );

        this.sendMessage(ws, encoding.toUint8Array(encoder));
      } catch (err) {
        this.logger.error('Failed to encode/send awareness update', err, {
          statesSize: states.size,
          hasMeta: !!this.awareness.meta,
          hasClock: this.awareness.meta ? this.awareness.meta.clock !== undefined : false
        });
      }
    }
  }

  /**
   * Broadcast awareness changes
   */
  broadcastAwareness(changedClients) {
    // CRITICAL: Guard against uninitialized awareness
    if (!this.awareness || !this.awareness.meta || this.awareness.meta.clock === undefined) {
      this.logger.warn('Cannot broadcast awareness: awareness not initialized', {
        hasAwareness: !!this.awareness,
        hasMeta: !!(this.awareness && this.awareness.meta),
        hasClock: !!(this.awareness && this.awareness.meta && this.awareness.meta.clock !== undefined),
        changedClients
      });
      return;
    }

    // Skip if no clients to broadcast to
    if (!changedClients || changedClients.length === 0) {
      return;
    }

    try {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );

      this.broadcast(encoding.toUint8Array(encoder));
    } catch (err) {
      this.logger.error('Failed to encode/broadcast awareness update', err, {
        changedClients,
        hasMeta: !!this.awareness.meta,
        hasClock: this.awareness.meta ? this.awareness.meta.clock !== undefined : false
      });
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
    const updatePath = path.join(this.persistencePath, this.docId, 'updates');
    await fs.mkdir(updatePath, { recursive: true });

    const timestamp = Date.now();
    const filename = `${timestamp}.update`;
    const filepath = path.join(updatePath, filename);

    await fs.writeFile(filepath, update);
  }

  /**
   * Create and save a snapshot
   */
  async createSnapshot() {
    const snapshotPath = path.join(this.persistencePath, this.docId, 'snapshots');
    await fs.mkdir(snapshotPath, { recursive: true });

    // Create state vector and snapshot
    const stateVector = Y.encodeStateVector(this.doc);
    const snapshot = Y.encodeStateAsUpdate(this.doc);

    const timestamp = Date.now();
    const filename = `${timestamp}.snapshot`;
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
    const docPath = path.join(this.persistencePath, this.docId);

    try {
      const snapshotPath = path.join(docPath, 'snapshots');
      const snapshots = await fs.readdir(snapshotPath);
      const snapshotFiles = snapshots
        .filter(f => f.endsWith('.snapshot'))
        .sort()
        .reverse();

      if (snapshotFiles.length > 0) {
        const latestSnapshot = snapshotFiles[0];
        const snapshotData = await fs.readFile(path.join(snapshotPath, latestSnapshot));
        Y.applyUpdate(this.doc, snapshotData, 'persistence');

        this.logger.info('Loaded snapshot', { snapshot: latestSnapshot });

        const snapshotTimestamp = parseInt(latestSnapshot.split('.')[0]);
        this.lastSnapshot = snapshotTimestamp;

        await this.loadUpdatesAfter(snapshotTimestamp);
      } else {
        await this.loadUpdatesAfter(0);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      this.logger.info('No persisted state found, starting fresh');
    }
  }

  /**
   * Load updates created after a specific timestamp
   */
  async loadUpdatesAfter(timestamp) {
    try {
      const updatePath = path.join(this.persistencePath, this.docId, 'updates');
      const updates = await fs.readdir(updatePath);

      const relevantUpdates = updates
        .filter(f => f.endsWith('.update'))
        .filter(f => parseInt(f.split('.')[0]) > timestamp)
        .sort();

      for (const updateFile of relevantUpdates) {
        const updateData = await fs.readFile(path.join(updatePath, updateFile));
        Y.applyUpdate(this.doc, updateData, 'persistence');
        this.updateLog.push(updateData);
      }

      if (relevantUpdates.length > 0) {
        this.logger.info('Loaded updates', { count: relevantUpdates.length });
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * Clean up old snapshots, keeping only the most recent N
   */
  async cleanupOldSnapshots(keepCount = 10) {
    try {
      const snapshotPath = path.join(this.persistencePath, this.docId, 'snapshots');
      const files = await fs.readdir(snapshotPath);

      const snapshotFiles = files
        .filter(f => f.endsWith('.snapshot'))
        .sort()
        .reverse();

      if (snapshotFiles.length > keepCount) {
        const toDelete = snapshotFiles.slice(keepCount);

        for (const file of toDelete) {
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
