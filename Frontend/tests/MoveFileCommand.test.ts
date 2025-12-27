/**
 * MoveFileCommand Unit Tests
 * 
 * Tests the MoveFileCommand implementation of the Command pattern.
 */

import { MoveFileCommand } from '../app/lib/commands/MoveFileCommand';

describe('MoveFileCommand', () => {
  const userId = 'user123';
  const projectId = 'project456';
  const sourcePath = 'test/source.txt';
  const destinationPath = 'test/destination.txt';

  let mockFileSystem: {
    moveItem: jest.Mock;
  };

  beforeEach(() => {
    mockFileSystem = {
      moveItem: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe('Command Execution', () => {
    it('should move file from source to destination', async () => {
      const command = new MoveFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await command.execute();

      expect(mockFileSystem.moveItem).toHaveBeenCalledWith(
        projectId,
        sourcePath,
        destinationPath
      );
      expect(mockFileSystem.moveItem).toHaveBeenCalledTimes(1);
    });

    it('should throw error if move fails', async () => {
      mockFileSystem.moveItem.mockRejectedValue(new Error('Move failed'));
      const command = new MoveFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await expect(command.execute()).rejects.toThrow('Move failed');
    });
  });

  describe('Command Undo', () => {
    it('should move file back to original location when undone', async () => {
      const command = new MoveFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await command.execute();
      await command.undo();

      expect(mockFileSystem.moveItem).toHaveBeenCalledWith(
        projectId,
        destinationPath,
        sourcePath
      );
      expect(mockFileSystem.moveItem).toHaveBeenCalledTimes(2);
    });

    it('should throw error if move back fails during undo', async () => {
      mockFileSystem.moveItem
        .mockResolvedValueOnce(undefined) // First call (execute)
        .mockRejectedValueOnce(new Error('Move back failed')); // Second call (undo)
      
      const command = new MoveFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await command.execute();
      await expect(command.undo()).rejects.toThrow('Move back failed');
    });
  });

  describe('Command Properties', () => {
    it('should return correct description', () => {
      const command = new MoveFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      expect(command.getDescription()).toBe(`Move "${sourcePath}" to "${destinationPath}"`);
    });

    it('should always be undoable', () => {
      const command = new MoveFileCommand(
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
      const command = new MoveFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      const serialized = command.serialize();

      expect(serialized.type).toBe('MOVE_FILE');
      expect(serialized.userId).toBe(userId);
      expect(serialized.projectId).toBe(projectId);
      expect(serialized.metadata.sourcePath).toBe(sourcePath);
      expect(serialized.metadata.destinationPath).toBe(destinationPath);
      expect(serialized.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Command Lifecycle', () => {
    it('should support execute -> undo -> redo cycle', async () => {
      const command = new MoveFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      // Execute
      await command.execute();
      expect(mockFileSystem.moveItem).toHaveBeenCalledTimes(1);

      // Undo (move back)
      await command.undo();
      expect(mockFileSystem.moveItem).toHaveBeenCalledTimes(2);

      // Redo (move again)
      await command.redo();
      expect(mockFileSystem.moveItem).toHaveBeenCalledTimes(3);
    });
  });
});

