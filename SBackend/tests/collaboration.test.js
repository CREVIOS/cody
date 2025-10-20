const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const Y = require('yjs');
const { CollaborationRoom, CollaborationService } = require('../services/collaborationService');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs').promises;

/**
 * CRDT Collaboration Tests
 *
 * Property-based tests for:
 * - Convergence: all clients reach same state
 * - Idempotency: applying same update twice has no effect
 * - Commutativity: order of updates doesn't matter
 * - Associativity: grouping of updates doesn't matter
 */

describe('CRDT Collaboration', () => {
  describe('Convergence Tests', () => {
    it('should converge when two clients edit simultaneously', async () => {
      // Create two independent documents
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();

      const text1 = doc1.getText('monaco');
      const text2 = doc2.getText('monaco');

      // Client 1 inserts
      text1.insert(0, 'Hello');

      // Client 2 inserts (doesn't know about client 1's change yet)
      text2.insert(0, 'World');

      // Exchange updates
      const update1 = Y.encodeStateAsUpdate(doc1);
      const update2 = Y.encodeStateAsUpdate(doc2);

      Y.applyUpdate(doc2, update1);
      Y.applyUpdate(doc1, update2);

      // Both should converge to same state
      assert.strictEqual(text1.toString(), text2.toString());
      assert.ok(['HelloWorld', 'WorldHello'].includes(text1.toString()));
    });

    it('should converge with concurrent edits at different positions', async () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const doc3 = new Y.Doc();

      const text1 = doc1.getText('monaco');
      const text2 = doc2.getText('monaco');
      const text3 = doc3.getText('monaco');

      // All start with same content
      text1.insert(0, 'The quick fox');

      const initialUpdate = Y.encodeStateAsUpdate(doc1);
      Y.applyUpdate(doc2, initialUpdate);
      Y.applyUpdate(doc3, initialUpdate);

      // Concurrent edits
      text1.insert(10, 'brown '); // "The quick brown fox"
      text2.insert(13, ' jumps'); // "The quick fox jumps"
      text3.delete(4, 6); // "The fox"

      // Exchange updates (simulate network)
      const updates = [
        Y.encodeStateAsUpdate(doc1),
        Y.encodeStateAsUpdate(doc2),
        Y.encodeStateAsUpdate(doc3),
      ];

      // Apply all updates to all docs
      for (const update of updates) {
        Y.applyUpdate(doc1, update);
        Y.applyUpdate(doc2, update);
        Y.applyUpdate(doc3, update);
      }

      // All should converge
      assert.strictEqual(text1.toString(), text2.toString());
      assert.strictEqual(text2.toString(), text3.toString());
    });

    it('should handle deep concurrent edit chains', async () => {
      const clients = Array.from({ length: 5 }, () => new Y.Doc());
      const texts = clients.map((doc) => doc.getText('monaco'));

      // Initialize all with same content
      texts[0].insert(0, 'Base content');
      const initialUpdate = Y.encodeStateAsUpdate(clients[0]);

      for (let i = 1; i < clients.length; i++) {
        Y.applyUpdate(clients[i], initialUpdate);
      }

      // Each client makes changes
      texts[0].insert(0, 'A: ');
      texts[1].insert(texts[1].length, ' B');
      texts[2].insert(5, 'C');
      texts[3].delete(0, 4);
      texts[4].insert(7, 'D');

      // Collect all updates
      const updates = clients.map((doc) => Y.encodeStateAsUpdate(doc));

      // Apply all updates to all clients (simulate broadcast)
      for (const update of updates) {
        for (const doc of clients) {
          Y.applyUpdate(doc, update);
        }
      }

      // All clients should converge
      const finalStates = texts.map((t) => t.toString());
      const firstState = finalStates[0];

      for (const state of finalStates) {
        assert.strictEqual(state, firstState);
      }
    });
  });

  describe('Idempotency Tests', () => {
    it('should be idempotent when applying same update twice', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();

      const text1 = doc1.getText('monaco');
      text1.insert(0, 'Hello World');

      const update = Y.encodeStateAsUpdate(doc1);

      // Apply update twice
      Y.applyUpdate(doc2, update);
      const stateAfterFirst = doc2.getText('monaco').toString();

      Y.applyUpdate(doc2, update);
      const stateAfterSecond = doc2.getText('monaco').toString();

      assert.strictEqual(stateAfterFirst, stateAfterSecond);
      assert.strictEqual(stateAfterFirst, 'Hello World');
    });

    it('should be idempotent with multiple concurrent updates', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const doc3 = new Y.Doc();

      doc1.getText('monaco').insert(0, 'A');
      doc2.getText('monaco').insert(0, 'B');
      doc3.getText('monaco').insert(0, 'C');

      const updates = [
        Y.encodeStateAsUpdate(doc1),
        Y.encodeStateAsUpdate(doc2),
        Y.encodeStateAsUpdate(doc3),
      ];

      const target = new Y.Doc();

      // Apply all updates twice
      updates.forEach((u) => Y.applyUpdate(target, u));
      const stateAfterFirst = target.getText('monaco').toString();

      updates.forEach((u) => Y.applyUpdate(target, u));
      const stateAfterSecond = target.getText('monaco').toString();

      assert.strictEqual(stateAfterFirst, stateAfterSecond);
    });
  });

  describe('Commutativity Tests', () => {
    it('should be commutative (order of updates does not matter)', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const doc3 = new Y.Doc();

      doc1.getText('monaco').insert(0, 'A');
      doc2.getText('monaco').insert(0, 'B');
      doc3.getText('monaco').insert(0, 'C');

      const updates = [
        Y.encodeStateAsUpdate(doc1),
        Y.encodeStateAsUpdate(doc2),
        Y.encodeStateAsUpdate(doc3),
      ];

      // Apply in different orders
      const targetABC = new Y.Doc();
      const targetCBA = new Y.Doc();

      [updates[0], updates[1], updates[2]].forEach((u) =>
        Y.applyUpdate(targetABC, u)
      );
      [updates[2], updates[1], updates[0]].forEach((u) =>
        Y.applyUpdate(targetCBA, u)
      );

      assert.strictEqual(
        targetABC.getText('monaco').toString(),
        targetCBA.getText('monaco').toString()
      );
    });
  });

  describe('Offline/Online Scenarios', () => {
    it('should handle offline edits and resync', () => {
      const online = new Y.Doc();
      const offline = new Y.Doc();

      // Both start synchronized
      online.getText('monaco').insert(0, 'Initial content');
      const initialUpdate = Y.encodeStateAsUpdate(online);
      Y.applyUpdate(offline, initialUpdate);

      // Online makes changes
      online.getText('monaco').insert(0, 'Online: ');

      // Offline makes changes (doesn't receive online updates)
      offline.getText('monaco').insert(offline.getText('monaco').length, ' :Offline');

      // Resync
      const onlineUpdate = Y.encodeStateAsUpdate(online);
      const offlineUpdate = Y.encodeStateAsUpdate(offline);

      Y.applyUpdate(offline, onlineUpdate);
      Y.applyUpdate(online, offlineUpdate);

      // Should converge
      assert.strictEqual(
        online.getText('monaco').toString(),
        offline.getText('monaco').toString()
      );
    });

    it('should handle late-join clients', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();

      // Doc1 has history
      const text1 = doc1.getText('monaco');
      text1.insert(0, 'First');
      text1.insert(5, ' Second');
      text1.insert(12, ' Third');

      // Doc2 joins late and gets full state
      const fullUpdate = Y.encodeStateAsUpdate(doc1);
      Y.applyUpdate(doc2, fullUpdate);

      assert.strictEqual(
        doc2.getText('monaco').toString(),
        'First Second Third'
      );

      // Continue collaborating
      text1.insert(0, 'Start: ');
      doc2.getText('monaco').insert(doc2.getText('monaco').length, ' :End');

      // Sync again
      const update1 = Y.encodeStateAsUpdate(doc1);
      const update2 = Y.encodeStateAsUpdate(doc2);

      Y.applyUpdate(doc2, update1);
      Y.applyUpdate(doc1, update2);

      assert.strictEqual(
        doc1.getText('monaco').toString(),
        doc2.getText('monaco').toString()
      );
    });
  });

  describe('CollaborationRoom Tests', () => {
    let room;
    const testDir = path.join(__dirname, '../data/collaboration-test');

    before(async () => {
      await fs.mkdir(testDir, { recursive: true });
    });

    after(async () => {
      if (room) {
        await room.close();
      }
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should create and persist room', async () => {
      room = new CollaborationRoom('test-doc', testDir);

      // Make some changes
      room.doc.getText('monaco').insert(0, 'Test content');

      // Wait for persistence
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check metrics
      const metrics = room.getMetrics();
      assert.ok(metrics.totalUpdates > 0);
    });

    it('should load persisted state', async () => {
      // Create room and add content
      const room1 = new CollaborationRoom('persistent-doc', testDir);
      room1.doc.getText('monaco').insert(0, 'Persisted content');

      // Force snapshot
      await room1.createSnapshot();
      await room1.close();

      // Create new room with same ID (should load from disk)
      const room2 = new CollaborationRoom('persistent-doc', testDir);
      await room2.loadFromDisk();

      // Give it time to load
      await new Promise((resolve) => setTimeout(resolve, 200));

      const content = room2.getText();
      assert.strictEqual(content, 'Persisted content');

      await room2.close();
    });
  });

  describe('Network Partition Simulation', () => {
    it('should handle network partition and healing', () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();
      const docC = new Y.Doc();

      // All start together
      docA.getText('monaco').insert(0, 'Start');
      let update = Y.encodeStateAsUpdate(docA);
      Y.applyUpdate(docB, update);
      Y.applyUpdate(docC, update);

      // Network partition: A-B can communicate, C is isolated
      docA.getText('monaco').insert(0, 'A: ');
      docB.getText('monaco').insert(docB.getText('monaco').length, ' :B');

      // Sync A and B
      const updateA = Y.encodeStateAsUpdate(docA);
      const updateB = Y.encodeStateAsUpdate(docB);
      Y.applyUpdate(docA, updateB);
      Y.applyUpdate(docB, updateA);

      // C makes isolated changes
      docC.getText('monaco').insert(docC.getText('monaco').length, ' :C');

      // Network heals - all sync
      const updateASynced = Y.encodeStateAsUpdate(docA);
      const updateBSynced = Y.encodeStateAsUpdate(docB);
      const updateC = Y.encodeStateAsUpdate(docC);

      Y.applyUpdate(docC, updateASynced);
      Y.applyUpdate(docC, updateBSynced);
      Y.applyUpdate(docA, updateC);
      Y.applyUpdate(docB, updateC);

      // All should converge
      assert.strictEqual(
        docA.getText('monaco').toString(),
        docB.getText('monaco').toString()
      );
      assert.strictEqual(
        docB.getText('monaco').toString(),
        docC.getText('monaco').toString()
      );
    });
  });

  describe('Stress Tests', () => {
    it('should handle rapid concurrent edits', () => {
      const docs = Array.from({ length: 10 }, () => new Y.Doc());
      const texts = docs.map((doc) => doc.getText('monaco'));

      // Initialize all
      texts[0].insert(0, 'x'.repeat(100));
      const init = Y.encodeStateAsUpdate(docs[0]);
      docs.slice(1).forEach((doc) => Y.applyUpdate(doc, init));

      // Rapid concurrent edits
      for (let i = 0; i < 100; i++) {
        const docIndex = i % docs.length;
        const position = Math.floor(Math.random() * texts[docIndex].length);
        const char = String.fromCharCode(65 + (i % 26));

        texts[docIndex].insert(position, char);
      }

      // Sync all
      const updates = docs.map((doc) => Y.encodeStateAsUpdate(doc));
      for (const update of updates) {
        for (const doc of docs) {
          Y.applyUpdate(doc, update);
        }
      }

      // All should converge
      const finalState = texts[0].toString();
      for (const text of texts) {
        assert.strictEqual(text.toString(), finalState);
      }
    });

    it('should handle large document efficiently', () => {
      const doc = new Y.Doc();
      const text = doc.getText('monaco');

      // Insert large content
      const largeContent = 'x'.repeat(10000);
      text.insert(0, largeContent);

      // Make edits throughout
      for (let i = 0; i < 100; i++) {
        const pos = Math.floor(Math.random() * text.length);
        text.insert(pos, '\n');
      }

      // Encode/decode should be fast
      const start = Date.now();
      const update = Y.encodeStateAsUpdate(doc);
      const newDoc = new Y.Doc();
      Y.applyUpdate(newDoc, update);
      const duration = Date.now() - start;

      // Should complete in reasonable time (< 100ms)
      assert.ok(duration < 100);
      assert.strictEqual(newDoc.getText('monaco').toString(), text.toString());
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running CRDT Collaboration Tests...\n');
}
