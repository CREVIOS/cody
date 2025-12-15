/**
 * Yjs Singleton
 * 
 * Ensures Yjs is imported only once across the entire application.
 * This prevents "Yjs already imported" errors and ensures consistent
 * Yjs instance usage for proper CRDT synchronization.
 * 
 * Usage:
 *   import { Y } from '@/lib/collaboration/yjsSingleton';
 *   const doc = new Y.Doc();
 */

// Import Yjs once and export it
import * as Y from 'yjs';

// Export the singleton instance
export { Y };

// Re-export commonly used Yjs types and utilities
export type { Doc } from 'yjs';

// Ensure this module is only loaded once
if (typeof window !== 'undefined') {
  // In browser environment, ensure Yjs is available globally for debugging
  (window as any).__YJS_SINGLETON__ = Y;
}

