const path = require('path');
const fs = require('fs').promises;
const os = require('os');

const { CollaborationRoom } = require('../services/collaborationService');

describe('CollaborationService safety', () => {
  it('stores persistence under hashed path (no traversal)', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'collab-safe-'));
    const docId = '../evil/../../path';

    const room = new CollaborationRoom(docId, tmpRoot, { snapshotInterval: 60_000 });

    // Wait for any async load to settle; best-effort.
    await new Promise((r) => setTimeout(r, 10));

    await room.persistUpdate(Buffer.from([1, 2, 3]));

    // Ensure no legacy traversal directory was created
    const legacyPath = path.join(tmpRoot, docId);
    const rootResolved = path.resolve(tmpRoot);
    const legacyResolved = path.resolve(legacyPath);
    expect(legacyResolved.startsWith(rootResolved + path.sep)).toBe(false);

    // Ensure the hashed directory exists with updates
    const entries = await fs.readdir(tmpRoot);
    expect(entries.length).toBeGreaterThan(0);
    const hashedDir = entries[0];
    const updatesDir = path.join(tmpRoot, hashedDir, 'updates');
    const updateFiles = await fs.readdir(updatesDir);
    expect(updateFiles.some((f) => f.endsWith('.update'))).toBe(true);

    await room.close();
  });
});

