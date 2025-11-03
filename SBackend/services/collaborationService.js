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
    this.connections = new Map(); // clientId -> { ws, user }
    this.updateLog = []; // Array of Uint8Array updates
    this.lastSnapshot = Date.now();

    // Configuration
    this.config = {
      snapshotInterval: options.snapshotInterval || 5 * 60 * 1000, // 5 minutes
      maxUpdatesBeforeSnapshot: options.maxUpdatesBeforeSnapshot || 100,
      gcEnabled: options.gcEnabled !== false,
      ...options
    };

    // Logger
    this.logger = createLogger({ service: 'CollaborationRoom', docId });

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
      lastActivity: Date.now()
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
    this.connections.set(clientId, { ws, user: userInfo });
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
   * Handle incoming WebSocket message
   */
  handleMessage(clientId, data) {
    try {
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
          this.handleUpdate(clientId, decoder);
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
   * Handle document update
   */
  handleUpdate(clientId, decoder) {
    const update = syncProtocol.readUpdate(decoder, this.doc, 'client');

    // Broadcast to other clients
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
    encoding.writeVarUint8Array(encoder, update);
    const message = encoding.toUint8Array(encoder);

    this.broadcast(message, [clientId]);
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
