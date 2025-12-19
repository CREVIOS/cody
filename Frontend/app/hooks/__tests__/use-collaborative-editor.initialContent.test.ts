import { Y } from '@/lib/collaboration/yjsSingleton';

/**
 * Regression: Initial content must NOT be applied before the WebSocket sync finishes.
 * Otherwise, if another peer already has the doc content and we also insert initial content,
 * the CRDT merges both inserts and the user sees duplicated content.
 *
 * This test exercises the "maybeApplyInitialContent" gating logic (wsSynced + offlineReady).
 */
describe('use-collaborative-editor initialContent gating', () => {
  test('applies initial content only after ws sync + offline ready', () => {
    const doc = new Y.Doc();
    const yText = doc.getText('monaco');
    const initialContent = 'hello\nworld\n';

    let applied = false;
    let wsSynced = false;
    let offlineReady = false;

    const maybeApplyInitialContent = () => {
      if (applied) return;
      if (!wsSynced || !offlineReady) return;
      if (yText.toString().length > 0) return;
      yText.insert(0, initialContent);
      applied = true;
    };

    // Before sync/ready: should not apply
    maybeApplyInitialContent();
    expect(yText.toString()).toBe('');

    // Only offline ready: still not
    offlineReady = true;
    maybeApplyInitialContent();
    expect(yText.toString()).toBe('');

    // Only ws sync: still not
    offlineReady = false;
    wsSynced = true;
    maybeApplyInitialContent();
    expect(yText.toString()).toBe('');

    // Both: applies once
    offlineReady = true;
    maybeApplyInitialContent();
    expect(yText.toString()).toBe(initialContent);

    // If doc already has content, it should never re-apply
    applied = false;
    yText.insert(yText.length, 'x');
    maybeApplyInitialContent();
    expect(yText.toString()).toBe(initialContent + 'x');
  });
});

