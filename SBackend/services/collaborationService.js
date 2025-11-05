const Y = require('yjs');
const { encoding, decoding } = require('lib0');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
// Local message type for awareness envelope (sync uses 0-2 in y-protocols/sync)
const messageAwareness = 3;
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const { createLogger } = require('./logger');
const axios = require('axios');

// Backend API configuration
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000/api/v1';
const LOCK_CHECK_ENABLED = process.env.LOCK_CHECK_ENABLED !== 'false'; // Default: enabled

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second
const RATE_LIMIT_MAX_MESSAGES = 50; // Max 50 messages per second per client

// Update batching configuration
const UPDATE_BATCH_INTERVAL_MS = 50; // Batch updates every 50ms

/**
 * CRDT Collaboration Service
 *
 * Implements Yjs-based collaborative editing with:
 * - Room-based document isolation (one room per docId)
 * - Awareness protocol for presence (cursors, selections)
 * - Persistent storage with snapshots and update logs
 * - Efficient sync protocol with late-join support
 * - Automatic garbage collection and snapshots
 */

class CollaborationRoom extends EventEmitter {
  constructor(docId, persistencePath, options = {}) {
    super();
    this.docId = docId;
    this.persistencePath = persistencePath;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
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
    // Track document updates for persistence
    this.doc.on('update', (update, origin, doc, transaction) => {
      if (origin !== 'persistence') {
        this.updateLog.push(update);
        this.metrics.totalUpdates++;
        this.metrics.lastActivity = Date.now();

        // Check if snapshot is needed
        this.checkSnapshot();

        // Persist update asynchronously
        this.persistUpdate(update).catch(err => {
          console.error(`[Room ${this.docId}] Persist error:`, err);
        });
      }
    });

    // Track awareness changes
    this.awareness.on('change', ({ added, updated, removed }) => {
      const changedClients = added.concat(updated, removed);
      if (changedClients.length > 0) {
        this.broadcastAwareness(changedClients);
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
      rateLimitTracker
    });
    this.metrics.totalConnections++;

    this.logger.event('client_joined', {
      clientId,
      userName: userInfo.name,
      activeConnections: this.connections.size,
    });

    this.logger.metric('active_connections', this.connections.size, 'count');

    // Send initial sync
    this.sendSyncStep1(ws);

    // Send current awareness state
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

    this.connections.delete(clientId);

    // Remove awareness state
    this.awareness.setLocalState(null);
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [clientId],
      'client disconnected'
    );

    console.log(`[Room ${this.docId}] Client ${clientId} left. Active: ${this.connections.size}`);

    this.emit('disconnection', { clientId });

    // Cleanup room if empty
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
          console.warn(`[Room ${this.docId}] Unknown message type: ${messageType}`);
      }
    } catch (err) {
      console.error(`[Room ${this.docId}] Error handling message from ${clientId}:`, err);
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

  /**
   * Check if a user has permission to edit (via file lock)
   */
  async checkEditPermission(userId, fileId) {
    if (!LOCK_CHECK_ENABLED) {
      return true; // Lock checking disabled
    }

    try {
      // Query the Backend lock service to verify user has the lock
      const response = await axios.get(`${BACKEND_API_URL}/locks/${fileId}/state`, {
        timeout: 2000, // 2 second timeout
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });

      if (response.status === 200 && response.data) {
        const lockState = response.data;

        // Check if locked and if this user is the holder
        if (lockState.state === 'LOCKED') {
          const isHolder = lockState.holder_user_id === userId;
          if (!isHolder) {
            this.logger.warn('Edit rejected: user does not hold lock', {
              userId,
              fileId,
              actualHolder: lockState.holder_user_id
            });
          }
          return isHolder;
        }

        // If unlocked, allow (for graceful degradation)
        return true;
      }

      // If lock service is unavailable, allow edit (fail-open for availability)
      this.logger.warn('Lock check failed, allowing edit (fail-open)', { userId, fileId, status: response.status });
      return true;
    } catch (error) {
      // Network error or timeout - fail open to maintain availability
      this.logger.error('Lock verification error, allowing edit (fail-open)', error);
      return true;
    }
  }

  /**
   * Handle document update with lock verification
   */
  async handleUpdate(clientId, decoder) {
    const conn = this.connections.get(clientId);
    if (!conn) {
      this.logger.warn('Update from unknown client', { clientId });
      return;
    }

    // Extract file ID from docId (assuming format: projectId/fileId or just fileId)
    const fileId = this.docId.includes('/') ? this.docId.split('/').pop() : this.docId;
    const userId = conn.user.id;

    // Verify user has permission to edit
    const hasPermission = await this.checkEditPermission(userId, fileId);

    if (!hasPermission) {
      this.logger.warn('Update rejected: no edit permission', { clientId, userId, fileId });

      // Send error message back to client
      const errorMessage = JSON.stringify({
        type: 'error',
        code: 'EDIT_PERMISSION_DENIED',
        message: 'You do not have permission to edit this file. Another user holds the lock.',
        timestamp: Date.now()
      });

      if (conn.ws.readyState === conn.ws.OPEN) {
        conn.ws.send(errorMessage);
      }

      return; // Reject the update
    }

    // Permission granted - apply update
    const update = syncProtocol.readUpdate(decoder, this.doc, 'client');

    // Broadcast with batching if enabled
    if (this.config.batchUpdatesEnabled) {
      this.queueUpdateForBroadcast(update, [clientId]);
    } else {
      // Immediate broadcast
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
      encoding.writeVarUint8Array(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.broadcast(message, [clientId]);
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

    // Merge all updates if possible (Yjs updates can be merged)
    const updates = this.pendingUpdates.map(p => p.update);
    const allExcludedClients = new Set(
      this.pendingUpdates.flatMap(p => p.excludeClientIds)
    );

    // For simplicity, send each update separately
    // (A more advanced implementation would merge compatible updates)
    for (const { update, excludeClientIds } of this.pendingUpdates) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
      encoding.writeVarUint8Array(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.broadcast(message, excludeClientIds);
    }

    this.logger.debug('Flushed update batch', {
      count: this.pendingUpdates.length,
      excludedClients: Array.from(allExcludedClients)
    });

    // Clear pending updates
    this.pendingUpdates = [];
    this.batchTimer = null;
  }

  /**
   * Handle awareness update (presence)
   */
  handleAwareness(clientId, decoder) {
    awarenessProtocol.applyAwarenessUpdate(
      this.awareness,
      decoding.readVarUint8Array(decoder),
      clientId
    );
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
    const states = this.awareness.getStates();
    if (states.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys()))
      );

      this.sendMessage(ws, encoding.toUint8Array(encoder));
    }
  }

  /**
   * Broadcast awareness changes
   */
  broadcastAwareness(changedClients) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
    );

    this.broadcast(encoding.toUint8Array(encoder));
  }

  /**
   * Broadcast message to all or some clients
   */
  broadcast(message, excludeClientIds = []) {
    const excludeSet = new Set(excludeClientIds);

    for (const [clientId, { ws }] of this.connections) {
      if (!excludeSet.has(clientId) && ws.readyState === ws.OPEN) {
        this.sendMessage(ws, message);
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
   * Check if snapshot is needed
   */
  checkSnapshot() {
    const timeSinceSnapshot = Date.now() - this.lastSnapshot;
    const shouldSnapshot =
      this.updateLog.length >= this.config.maxUpdatesBeforeSnapshot ||
      timeSinceSnapshot >= this.config.snapshotInterval;

    if (shouldSnapshot) {
      this.createSnapshot().catch(err => {
        console.error(`[Room ${this.docId}] Snapshot error:`, err);
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

    console.log(`[Room ${this.docId}] Snapshot created: ${filename} (${snapshot.byteLength} bytes)`);

    // Clear old updates
    this.updateLog = [];
    this.lastSnapshot = timestamp;

    // Run garbage collection if enabled
    if (this.config.gcEnabled) {
      this.doc.gc = true;
    }

    // Clean up old snapshots (keep last 10)
    await this.cleanupOldSnapshots(10);
  }

  /**
   * Load document state from disk
   */
  async loadFromDisk() {
    const docPath = path.join(this.persistencePath, this.docId);

    try {
      // Try to load latest snapshot
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

        console.log(`[Room ${this.docId}] Loaded snapshot: ${latestSnapshot}`);

        // Extract timestamp from filename
        const snapshotTimestamp = parseInt(latestSnapshot.split('.')[0]);
        this.lastSnapshot = snapshotTimestamp;

        // Load any updates after the snapshot
        await this.loadUpdatesAfter(snapshotTimestamp);
      } else {
        // No snapshot, load all updates
        await this.loadUpdatesAfter(0);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      console.log(`[Room ${this.docId}] No persisted state found, starting fresh`);
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
        console.log(`[Room ${this.docId}] Loaded ${relevantUpdates.length} updates`);
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

        console.log(`[Room ${this.docId}] Cleaned up ${toDelete.length} old snapshots`);
      }
    } catch (err) {
      console.error(`[Room ${this.docId}] Error cleaning snapshots:`, err);
    }
  }

  /**
   * Get room metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeConnections: this.connections.size,
      documentSize: Y.encodeStateAsUpdate(this.doc).byteLength,
      updateLogSize: this.updateLog.length,
      awarenessSize: this.awareness.getStates().size
    };
  }

  /**
   * Get current document content as text (for debugging)
   */
  getText() {
    const text = this.doc.getText('monaco');
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

    console.log(`[Room ${this.docId}] Closed`);
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

    // Cleanup interval for idle rooms
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleRooms();
    }, options.roomCleanupInterval || 60 * 1000); // 1 minute

    console.log('[CollaborationService] Initialized');
  }

  /**
   * Get or create a collaboration room
   */
  getRoom(docId) {
    if (!this.rooms.has(docId)) {
      const room = new CollaborationRoom(docId, this.persistencePath, this.options);

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
        console.log(`[CollaborationService] Closing idle room: ${docId}`);
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

    console.log('[CollaborationService] Shut down');
  }
}

module.exports = { CollaborationService, CollaborationRoom };
