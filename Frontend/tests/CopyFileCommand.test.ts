/**
 * CopyFileCommand Unit Tests
 * 
 * Tests the CopyFileCommand implementation of the Command pattern.
 */

import { CopyFileCommand } from '../app/lib/commands/CopyFileCommand';

describe('CopyFileCommand', () => {
  const userId = 'user123';
  const projectId = 'project456';
  const sourcePath = 'test/source.txt';
  const destinationPath = 'test/destination.txt';

  let mockFileSystem: {
    copyItem: jest.Mock;
    deleteItem: jest.Mock;
  };

  beforeEach(() => {
    mockFileSystem = {
      copyItem: jest.fn().mockResolvedValue(undefined),
      deleteItem: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe('Command Execution', () => {
    it('should copy file from source to destination', async () => {
      const command = new CopyFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await command.execute();

      expect(mockFileSystem.copyItem).toHaveBeenCalledWith(
        projectId,
        sourcePath,
        destinationPath
      );
      expect(mockFileSystem.copyItem).toHaveBeenCalledTimes(1);
    });

    it('should throw error if copy fails', async () => {
      mockFileSystem.copyItem.mockRejectedValue(new Error('Copy failed'));
      const command = new CopyFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await expect(command.execute()).rejects.toThrow('Copy failed');
    });
  });

  describe('Command Undo', () => {
    it('should delete the copied file when undone', async () => {
      const command = new CopyFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await command.execute();
      await command.undo();

      expect(mockFileSystem.deleteItem).toHaveBeenCalledWith(
        projectId,
        destinationPath
      );
      expect(mockFileSystem.deleteItem).toHaveBeenCalledTimes(1);
    });

    it('should throw error if deletion fails during undo', async () => {
      mockFileSystem.deleteItem.mockRejectedValue(new Error('Deletion failed'));
      const command = new CopyFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await command.execute();
      await expect(command.undo()).rejects.toThrow('Deletion failed');
    });
  });

  describe('Command Properties', () => {
    it('should return correct description', () => {
      const command = new CopyFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      expect(command.getDescription()).toBe(`Copy "${sourcePath}" to "${destinationPath}"`);
    });

    it('should always be undoable', () => {
      const command = new CopyFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      expect(command.canUndo()).toBe(true);
    });
  });

  describe('Command Serialization', () => {
    it('should serialize command with correct metadata', () => {
      const command = new CopyFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      const serialized = command.serialize();

      expect(serialized.type).toBe('COPY_FILE');
      expect(serialized.userId).toBe(userId);
      expect(serialized.projectId).toBe(projectId);
      expect(serialized.metadata.sourcePath).toBe(sourcePath);
      expect(serialized.metadata.destinationPath).toBe(destinationPath);
      expect(serialized.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Command Lifecycle', () => {
    it('should support execute -> undo -> redo cycle', async () => {
      const command = new CopyFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      // Execute
      await command.execute();
      expect(mockFileSystem.copyItem).toHaveBeenCalledTimes(1);

      // Undo
      await command.undo();
      expect(mockFileSystem.deleteItem).toHaveBeenCalledTimes(1);

      // Redo
      await command.redo();
      expect(mockFileSystem.copyItem).toHaveBeenCalledTimes(2);
    });
  });
});

