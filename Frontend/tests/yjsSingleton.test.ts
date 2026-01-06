/**
 * Yjs Singleton Tests
 * 
 * Tests that yjsSingleton correctly exports Yjs and ensures single import.
 */

import { Y } from '../app/lib/collaboration/yjsSingleton';

describe('yjsSingleton', () => {
  it('should export Y object', () => {
    expect(Y).toBeDefined();
    expect(typeof Y).toBe('object');
  });

  it('should export Y.Doc constructor', () => {
    expect(Y.Doc).toBeDefined();
    expect(typeof Y.Doc).toBe('function');
  });

  it('should allow creating Y.Doc instances', () => {
    const doc = new Y.Doc();
    expect(doc).toBeInstanceOf(Y.Doc);
  });

  it('should export Y.Text', () => {
    expect(Y.Text).toBeDefined();
    expect(typeof Y.Text).toBe('function');
  });

  it('should allow creating Y.Text instances', () => {
    const doc = new Y.Doc();
    const yText = doc.getText('test');
    expect(yText).toBeDefined();
  });

  it('should be the same Y instance across imports', () => {
    // Re-import to verify singleton behavior
    const { Y: Y2 } = require('../app/lib/collaboration/yjsSingleton');
    expect(Y).toBe(Y2);
  });

  it('should work in browser environment', () => {
    // Mock window object
    const originalWindow = global.window;
    (global as any).window = {};

    // Re-import to trigger window check
    const { Y: YBrowser } = require('../app/lib/collaboration/yjsSingleton');
    expect(YBrowser).toBeDefined();

    // Restore
    global.window = originalWindow;
  });
});

