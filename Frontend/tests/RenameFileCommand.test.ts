/**
 * RenameFileCommand Unit Tests
 * 
 * Tests the RenameFileCommand implementation of the Command pattern.
 */

import { RenameFileCommand } from '../app/lib/commands/RenameFileCommand';

describe('RenameFileCommand', () => {
  const userId = 'user123';
  const projectId = 'project456';
  const oldPath = 'test/oldname.txt';
  const newPath = 'test/newname.txt';

  let mockFileSystem: {
    renameItem: jest.Mock;
  };

  beforeEach(() => {
    mockFileSystem = {
      renameItem: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe('Command Execution', () => {
    it('should rename file from old path to new path', async () => {
      const command = new RenameFileCommand(
        userId,
        projectId,
        oldPath,
        newPath,
        mockFileSystem
      );

      await command.execute();

      expect(mockFileSystem.renameItem).toHaveBeenCalledWith(
        projectId,
        oldPath,
        newPath
      );
      expect(mockFileSystem.renameItem).toHaveBeenCalledTimes(1);
    });

    it('should throw error if rename fails', async () => {
      mockFileSystem.renameItem.mockRejectedValue(new Error('Rename failed'));
      const command = new RenameFileCommand(
        userId,
        projectId,
        oldPath,
        newPath,
        mockFileSystem
      );

      await expect(command.execute()).rejects.toThrow('Rename failed');
    });
  });

  describe('Command Undo', () => {
    it('should rename file back to original name when undone', async () => {
      const command = new RenameFileCommand(
        userId,
        projectId,
        oldPath,
        newPath,
        mockFileSystem
      );

      await command.execute();
      await command.undo();

      expect(mockFileSystem.renameItem).toHaveBeenCalledWith(
        projectId,
        newPath,
        oldPath
      );
      expect(mockFileSystem.renameItem).toHaveBeenCalledTimes(2);
    });

    it('should throw error if rename back fails during undo', async () => {
      mockFileSystem.renameItem
        .mockResolvedValueOnce(undefined) // First call (execute)
        .mockRejectedValueOnce(new Error('Rename back failed')); // Second call (undo)
      
      const command = new RenameFileCommand(
        userId,
        projectId,
        oldPath,
        newPath,
        mockFileSystem
      );

      await command.execute();
      await expect(command.undo()).rejects.toThrow('Rename back failed');
    });
  });

  describe('Command Properties', () => {
    it('should return correct description with file names', () => {
      const command = new RenameFileCommand(
        userId,
        projectId,
        oldPath,
        newPath,
        mockFileSystem
      );

      expect(command.getDescription()).toBe('Rename "oldname.txt" to "newname.txt"');
    });

    it('should handle nested paths in description', () => {
      const command = new RenameFileCommand(
        userId,
        projectId,
        'folder/subfolder/old.txt',
        'folder/subfolder/new.txt',
        mockFileSystem
      );

      expect(command.getDescription()).toBe('Rename "old.txt" to "new.txt"');
    });

    it('should always be undoable', () => {
      const command = new RenameFileCommand(
        userId,
        projectId,
        oldPath,
        newPath,
        mockFileSystem
      );

      expect(command.canUndo()).toBe(true);
    });
  });

  describe('Command Serialization', () => {
    it('should serialize command with correct metadata', () => {
      const command = new RenameFileCommand(
        userId,
        projectId,
        oldPath,
        newPath,
        mockFileSystem
      );

      const serialized = command.serialize();

      expect(serialized.type).toBe('RENAME_FILE');
      expect(serialized.userId).toBe(userId);
      expect(serialized.projectId).toBe(projectId);
      expect(serialized.metadata.oldPath).toBe(oldPath);
      expect(serialized.metadata.newPath).toBe(newPath);
      expect(serialized.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Command Lifecycle', () => {
    it('should support execute -> undo -> redo cycle', async () => {
      const command = new RenameFileCommand(
        userId,
        projectId,
        oldPath,
        newPath,
        mockFileSystem
      );

      // Execute
      await command.execute();
      expect(mockFileSystem.renameItem).toHaveBeenCalledTimes(1);

      // Undo (rename back)
      await command.undo();
      expect(mockFileSystem.renameItem).toHaveBeenCalledTimes(2);

      // Redo (rename again)
      await command.redo();
      expect(mockFileSystem.renameItem).toHaveBeenCalledTimes(3);
    });
  });
});

