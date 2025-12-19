const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { CollaborationRoom } = require('../services/collaborationService');

describe('CollaborationRoom initial content seeding', () => {
  test('seeds empty file doc from initialContentProvider', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'collab-init-'));
    try {
      const docId = 'file:proj-123:hello.py';
      const room = new CollaborationRoom(docId, dir, {
        initialContentProvider: async ({ projectId, filePath }) => {
          expect(projectId).toBe('proj-123');
          expect(filePath).toBe('hello.py');
          return 'print(\"hi\")\\n';
        },
      });

      await room.readyPromise;
      const text = room.doc.getText('monaco').toString();
      expect(text).toBe('print(\"hi\")\\n');
      await room.close();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('does not seed non-file docs', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'collab-init-'));
    try {
      const room = new CollaborationRoom('project:abc', dir, {
        initialContentProvider: async () => 'SHOULD_NOT_APPLY',
      });

      await room.readyPromise;
      expect(room.doc.getText('monaco').toString()).toBe('');
      await room.close();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

