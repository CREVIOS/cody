import { Y } from './yjsSingleton';
import { IndexeddbPersistence } from 'y-indexeddb';

/**
 * IndexedDB Persistence Provider
 *
 * Provides offline-first persistence for Yjs documents using IndexedDB.
 * Features:
 * - Automatic persistence of all document updates
 * - Fast document loading from local cache
 * - Seamless offline support
 * - Automatic synchronization when online
 */

export interface IndexedDBProviderOptions {
  /**
   * Document ID (used as database name)
   */
  docId: string;

  /**
   * Database name prefix (default: 'yjs-collab')
   */
  dbPrefix?: string;
}

export class IndexedDBProvider {
  private provider: IndexeddbPersistence;
  private doc: Y.Doc;
  private docId: string;

  constructor(doc: Y.Doc, options: IndexedDBProviderOptions) {
    this.doc = doc;
    this.docId = options.docId;

    const dbName = `${options.dbPrefix || 'yjs-collab'}-${options.docId}`;

    // Create IndexedDB persistence
    this.provider = new IndexeddbPersistence(dbName, doc);

    console.log(`[IndexedDB] Initialized for document: ${options.docId}`);
  }

  /**
   * Wait for initial sync from IndexedDB
   */
  public async whenSynced(): Promise<void> {
    return new Promise((resolve) => {
      if (this.provider.synced) {
        resolve();
      } else {
        this.provider.once('synced', () => {
          console.log(`[IndexedDB] Synced document: ${this.docId}`);
          resolve();
        });
      }
    });
  }

  /**
   * Check if synced
   */
  public isSynced(): boolean {
    return this.provider.synced;
  }

  /**
   * Clear persisted data
   */
  public async clearData(): Promise<void> {
    return this.provider.clearData();
  }

  /**
   * Clear persisted data (alias for clearData)
   */
  public async clear(): Promise<void> {
    return this.clearData();
  }

  /**
   * Destroy provider
   */
  public destroy(): void {
    this.provider.destroy();
    console.log(`[IndexedDB] Destroyed for document: ${this.docId}`);
  }
}

/**
 * Create IndexedDB provider for a Yjs document
 */
export function createIndexedDBProvider(
  doc: Y.Doc,
  docId: string,
  dbPrefix?: string
): IndexedDBProvider {
  return new IndexedDBProvider(doc, { docId, dbPrefix });
}
