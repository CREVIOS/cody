/**
 * Yjs Snapshot Manager
 * 
 * Provides versioning and snapshot functionality for Yjs documents.
 * Features:
 * - Create snapshots of Y.Doc state
 * - Restore documents from snapshots
 * - Version history management
 * - Automatic periodic snapshots
 * - Integration with backend storage (MinIO)
 */

import { Y } from './yjsSingleton';

export interface Snapshot {
  /**
   * Snapshot ID (timestamp or UUID)
   */
  id: string;

  /**
   * Snapshot timestamp
   */
  timestamp: number;

  /**
   * Document content as string
   */
  content: string;

  /**
   * Yjs state vector (for efficient diffing)
   */
  stateVector?: Uint8Array;

  /**
   * Yjs update (binary format)
   */
  update?: Uint8Array;

  /**
   * Metadata (optional)
   */
  metadata?: {
    version?: number;
    author?: string;
    description?: string;
    [key: string]: any;
  };
}

export interface SnapshotManagerOptions {
  /**
   * Yjs document to manage
   */
  doc: Y.Doc;

  /**
   * Yjs text type
   */
  yText: Y.Text;

  /**
   * Auto-snapshot interval in ms (0 to disable)
   * Default: 5 minutes
   */
  autoSnapshotInterval?: number;

  /**
   * Maximum number of snapshots to keep in memory
   * Default: 10
   */
  maxSnapshots?: number;

  /**
   * Callback when snapshot is created
   */
  onSnapshot?: (snapshot: Snapshot) => void;

  /**
   * Enable logging
   */
  logging?: boolean;
}

export class SnapshotManager {
  private doc: Y.Doc;
  private yText: Y.Text;
  private snapshots: Map<string, Snapshot> = new Map();
  private autoSnapshotInterval: number;
  private maxSnapshots: number;
  private autoSnapshotTimer: NodeJS.Timeout | null = null;
  private onSnapshotCallback?: (snapshot: Snapshot) => void;
  private logging: boolean;

  constructor(options: SnapshotManagerOptions) {
    this.doc = options.doc;
    this.yText = options.yText;
    this.autoSnapshotInterval = options.autoSnapshotInterval || 5 * 60 * 1000; // 5 minutes
    this.maxSnapshots = options.maxSnapshots || 10;
    this.onSnapshotCallback = options.onSnapshot;
    this.logging = options.logging !== false;

    // Start auto-snapshot if interval > 0
    if (this.autoSnapshotInterval > 0) {
      this.startAutoSnapshot();
    }
  }

  /**
   * Create a snapshot of the current document state
   */
  public createSnapshot(metadata?: Snapshot['metadata']): Snapshot {
    const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = Date.now();
    const content = this.yText.toString();
    const stateVector = Y.encodeStateVector(this.doc);
    const update = Y.encodeStateAsUpdate(this.doc);

    const snapshot: Snapshot = {
      id,
      timestamp,
      content,
      stateVector,
      update,
      metadata: metadata || {},
    };

    // Store snapshot
    this.snapshots.set(id, snapshot);

    // Enforce max snapshots limit
    if (this.snapshots.size > this.maxSnapshots) {
      const oldest = Array.from(this.snapshots.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      this.snapshots.delete(oldest[0]);
    }

    if (this.logging) {
      console.log('[SnapshotManager] Created snapshot:', id, {
        contentLength: content.length,
        updateSize: update.byteLength,
      });
    }

    // Call callback
    if (this.onSnapshotCallback) {
      this.onSnapshotCallback(snapshot);
    }

    return snapshot;
  }

  /**
   * Restore document from snapshot
   */
  public restoreSnapshot(snapshotId: string): boolean {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      if (this.logging) {
        console.warn('[SnapshotManager] Snapshot not found:', snapshotId);
      }
      return false;
    }

    return this.restoreFromSnapshot(snapshot);
  }

  /**
   * Restore document from snapshot object
   */
  public restoreFromSnapshot(snapshot: Snapshot): boolean {
    try {
      if (snapshot.update) {
        // Use Yjs update for efficient restoration
        Y.applyUpdate(this.doc, snapshot.update, 'snapshot-restore');
      } else {
        // Fallback: replace content directly
        const currentContent = this.yText.toString();
        this.yText.doc?.transact(() => {
          this.yText.delete(0, currentContent.length);
          this.yText.insert(0, snapshot.content);
        }, 'snapshot-restore');
      }

      if (this.logging) {
        console.log('[SnapshotManager] Restored from snapshot:', snapshot.id);
      }

      return true;
    } catch (error) {
      console.error('[SnapshotManager] Error restoring snapshot:', error);
      return false;
    }
  }

  /**
   * Get snapshot by ID
   */
  public getSnapshot(snapshotId: string): Snapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  /**
   * List all snapshots (sorted by timestamp, newest first)
   */
  public listSnapshots(): Snapshot[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Delete snapshot
   */
  public deleteSnapshot(snapshotId: string): boolean {
    return this.snapshots.delete(snapshotId);
  }

  /**
   * Clear all snapshots
   */
  public clearSnapshots(): void {
    this.snapshots.clear();
  }

  /**
   * Get snapshot count
   */
  public getSnapshotCount(): number {
    return this.snapshots.size;
  }

  /**
   * Start automatic snapshots
   */
  public startAutoSnapshot(): void {
    if (this.autoSnapshotTimer) {
      return; // Already running
    }

    if (this.autoSnapshotInterval <= 0) {
      return; // Disabled
    }

    this.autoSnapshotTimer = setInterval(() => {
      this.createSnapshot({
        auto: true,
        description: 'Automatic snapshot',
      });
    }, this.autoSnapshotInterval);

    if (this.logging) {
      console.log('[SnapshotManager] Auto-snapshot started:', this.autoSnapshotInterval, 'ms');
    }
  }

  /**
   * Stop automatic snapshots
   */
  public stopAutoSnapshot(): void {
    if (this.autoSnapshotTimer) {
      clearInterval(this.autoSnapshotTimer);
      this.autoSnapshotTimer = null;

      if (this.logging) {
        console.log('[SnapshotManager] Auto-snapshot stopped');
      }
    }
  }

  /**
   * Export snapshot to JSON (for backend storage)
   */
  public exportSnapshot(snapshotId: string): string | null {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      return null;
    }

    // Convert binary data to base64 for JSON serialization
    const exportData = {
      ...snapshot,
      stateVector: snapshot.stateVector
        ? Array.from(snapshot.stateVector)
        : undefined,
      update: snapshot.update
        ? Array.from(snapshot.update)
        : undefined,
    };

    return JSON.stringify(exportData);
  }

  /**
   * Import snapshot from JSON (from backend storage)
   */
  public importSnapshot(json: string): Snapshot | null {
    try {
      const data = JSON.parse(json);
      
      const snapshot: Snapshot = {
        id: data.id,
        timestamp: data.timestamp,
        content: data.content,
        stateVector: data.stateVector
          ? new Uint8Array(data.stateVector)
          : undefined,
        update: data.update
          ? new Uint8Array(data.update)
          : undefined,
        metadata: data.metadata,
      };

      this.snapshots.set(snapshot.id, snapshot);

      if (this.logging) {
        console.log('[SnapshotManager] Imported snapshot:', snapshot.id);
      }

      return snapshot;
    } catch (error) {
      console.error('[SnapshotManager] Error importing snapshot:', error);
      return null;
    }
  }

  /**
   * Destroy snapshot manager and cleanup
   */
  public destroy(): void {
    this.stopAutoSnapshot();
    this.clearSnapshots();
  }
}

/**
 * Create a snapshot manager
 */
export function createSnapshotManager(
  doc: Y.Doc,
  yText: Y.Text,
  options?: Partial<SnapshotManagerOptions>
): SnapshotManager {
  return new SnapshotManager({
    doc,
    yText,
    ...options,
  });
}

