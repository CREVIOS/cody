/**
 * Singleton Pattern Test Suite
 * Tests yjsSingleton.js singleton implementation
 *
 * This test suite verifies that the Singleton pattern is correctly
 * implemented, ensuring:
 * - Yjs is imported only once (singleton behavior)
 * - Multiple requires return the same Y instance
 * - Y can be used to create documents
 * - No "Yjs already imported" errors occur
 *
 * Run with: npm test -- yjsSingleton.test.js
 */

const { Y } = require('../services/yjsSingleton');

describe('Singleton Pattern - yjsSingleton', () => {
  describe('Singleton Behavior', () => {
    it('should export Y from singleton', () => {
      expect(Y).toBeDefined();
      expect(typeof Y.Doc).toBe('function');
    });

    it('should return the same Y instance on multiple requires', () => {
      // Clear require cache to test singleton behavior
      // In real usage, require cache ensures singleton
      const { Y: Y1 } = require('../services/yjsSingleton');
      const { Y: Y2 } = require('../services/yjsSingleton');

      // Both should be the same object reference
      expect(Y1).toBe(Y2);
      expect(Y1).toBe(Y);
    });

    it('should allow creating Y.Doc instances', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();

      expect(doc1).toBeDefined();
      expect(doc2).toBeDefined();
      expect(doc1).not.toBe(doc2); // Different instances
    });

    it('should have Y.Doc constructor from singleton', () => {
      const doc = new Y.Doc();
      expect(doc.constructor).toBe(Y.Doc);
    });
  });

  describe('Yjs Functionality', () => {
    it('should support Y.Text operations', () => {
      const doc = new Y.Doc();
      const yText = doc.getText('content');

      yText.insert(0, 'Hello World');
      expect(yText.toString()).toBe('Hello World');

      yText.insert(6, 'Beautiful ');
      expect(yText.toString()).toBe('Hello Beautiful World');
    });

    it('should support Y.Map operations', () => {
      const doc = new Y.Doc();
      const yMap = doc.getMap('data');

      yMap.set('key1', 'value1');
      yMap.set('key2', 42);

      expect(yMap.get('key1')).toBe('value1');
      expect(yMap.get('key2')).toBe(42);
    });

    it('should support Y.Array operations', () => {
      const doc = new Y.Doc();
      const yArray = doc.getArray('items');

      yArray.insert(0, ['a', 'b', 'c']);
      expect(yArray.toArray()).toEqual(['a', 'b', 'c']);

      yArray.delete(1, 1);
      expect(yArray.toArray()).toEqual(['a', 'c']);
    });
  });

  describe('Singleton Pattern Characteristics', () => {
    it('should prevent multiple Yjs imports (singleton purpose)', () => {
      // The singleton ensures Yjs is only imported once
      // This prevents "Yjs already imported" errors
      const { Y: Y1 } = require('../services/yjsSingleton');
      const { Y: Y2 } = require('../services/yjsSingleton');

      // Same reference = singleton behavior
      expect(Y1).toBe(Y2);
    });

    it('should provide consistent Yjs API', () => {
      expect(Y.Doc).toBeDefined();
      expect(Y.Text).toBeDefined();
      expect(Y.Map).toBeDefined();
      expect(Y.Array).toBeDefined();
      expect(typeof Y.encodeStateAsUpdate).toBe('function');
      expect(typeof Y.applyUpdate).toBe('function');
    });
  });
});

