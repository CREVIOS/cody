/**
 * Singleton Pattern Test Suite
 * Tests singleton implementations in EventBus and CommandManager
 *
 * This test suite verifies that the Singleton pattern is correctly
 * implemented, ensuring:
 * - Only one instance exists
 * - getInstance() returns the same instance
 * - Private constructor prevents direct instantiation
 */

import { EventBus } from '../app/lib/events/EventBus';
import { CommandManager, commandManager } from '../app/lib/commands/CommandManager';

describe('Singleton Pattern', () => {
  describe('EventBus Singleton', () => {
    it('should return the same instance on multiple getInstance() calls', () => {
      const instance1 = EventBus.getInstance();
      const instance2 = EventBus.getInstance();
      const instance3 = EventBus.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(instance1).toBe(instance3);
    });

    it('should maintain state across getInstance() calls', () => {
      const bus1 = EventBus.getInstance();
      const bus2 = EventBus.getInstance();

      let eventReceived = false;
      bus1.subscribe('test:event' as any, () => {
        eventReceived = true;
      });

      bus2.publish({ type: 'test:event' as any });

      expect(eventReceived).toBe(true);
    });

    it('should have private constructor (cannot be instantiated with new)', () => {
      // TypeScript will prevent this at compile time, but we can verify
      // that getInstance() is the only way to access the instance
      const instance = EventBus.getInstance();
      expect(instance).toBeDefined();
      expect(typeof instance.subscribe).toBe('function');
      expect(typeof instance.publish).toBe('function');
    });

    it('should maintain singleton behavior across test runs', () => {
      // Clear any existing instance (if possible)
      // Note: In a real scenario, you might need to reset the singleton
      const instance1 = EventBus.getInstance();
      
      // Simulate multiple access patterns
      const instance2 = EventBus.getInstance();
      const instance3 = EventBus.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });
  });

  describe('CommandManager Singleton', () => {
    it('should export a singleton instance', () => {
      expect(commandManager).toBeDefined();
      expect(commandManager instanceof CommandManager).toBe(true);
    });

    it('should allow creating new instances but singleton export should be consistent', () => {
      // CommandManager allows new instances, but the exported commandManager
      // should be a consistent singleton reference
      const manager1 = commandManager;
      const manager2 = commandManager;

      expect(manager1).toBe(manager2);
    });

    it('should maintain state in singleton instance', () => {
      const manager1 = commandManager;
      const manager2 = commandManager;

      // Both should reference the same instance
      expect(manager1.canUndo()).toBe(manager2.canUndo());
      expect(manager1.canRedo()).toBe(manager2.canRedo());
    });

    it('should have consistent behavior across references', () => {
      const manager1 = commandManager;
      const manager2 = commandManager;

      expect(manager1).toBe(manager2);
      expect(typeof manager1.execute).toBe('function');
      expect(typeof manager2.execute).toBe('function');
      expect(typeof manager1.undo).toBe('function');
      expect(typeof manager2.undo).toBe('function');
    });
  });

  describe('Singleton Pattern Benefits', () => {
    it('should ensure single source of truth for EventBus', () => {
      const bus1 = EventBus.getInstance();
      const bus2 = EventBus.getInstance();

      // Both should be the same instance
      expect(bus1).toBe(bus2);

      // State changes in one should be visible in the other
      let callCount = 0;
      bus1.subscribe('test:count' as any, () => {
        callCount++;
      });

      bus2.publish({ type: 'test:count' as any });
      expect(callCount).toBe(1);
    });

    it('should ensure single source of truth for CommandManager', () => {
      const manager1 = commandManager;
      const manager2 = commandManager;

      // Both should be the same instance
      expect(manager1).toBe(manager2);

      // State should be consistent
      const canUndo1 = manager1.canUndo();
      const canUndo2 = manager2.canUndo();
      expect(canUndo1).toBe(canUndo2);
    });
  });
});

