/**
 * Yjs Singleton
 * 
 * Ensures Yjs is imported only once across the entire application.
 * This prevents "Yjs already imported" errors and ensures consistent
 * Yjs instance usage for proper CRDT synchronization.
 * 
 * Usage:
 *   const { Y } = require('./yjsSingleton');
 *   const doc = new Y.Doc();
 */

// Import Yjs once and export it
const Y = require('yjs');

// Export the singleton instance
module.exports = { Y };

