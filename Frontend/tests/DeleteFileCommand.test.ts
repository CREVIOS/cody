/**
 * DeleteFileCommand Unit Tests
 * 
 * Tests the DeleteFileCommand implementation of the Command pattern.
 */

import { DeleteFileCommand } from '../app/lib/commands/DeleteFileCommand';

describe('DeleteFileCommand', () => {
  const userId = 'user123';
  const projectId = 'project456';
  const filePath = 'test/file.txt';
  const fileContent = 'Original file content';

  let mockFileSystem: {
    readFile: jest.Mock;
    deleteItem: jest.Mock;
    createFile: jest.Mock;
  };

  beforeEach(() => {
    mockFileSystem = {
      readFile: jest.fn().mockResolvedValue(fileContent),
      deleteItem: jest.fn().mockResolvedValue(undefined),
      createFile: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe('Command Execution', () => {
    it('should read file content before deleting', async () => {
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      await command.execute();

      expect(mockFileSystem.readFile).toHaveBeenCalledWith(
        projectId,
        filePath
      );
      // Verify readFile was called before deleteItem by checking call order
      const readFileCallOrder = (mockFileSystem.readFile as jest.Mock).mock.invocationCallOrder[0];
      const deleteItemCallOrder = (mockFileSystem.deleteItem as jest.Mock).mock.invocationCallOrder[0];
      expect(readFileCallOrder).toBeLessThan(deleteItemCallOrder);
    });

    it('should delete the file after reading content', async () => {
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      await command.execute();

      expect(mockFileSystem.deleteItem).toHaveBeenCalledWith(
        projectId,
        filePath
      );
      expect(mockFileSystem.deleteItem).toHaveBeenCalledTimes(1);
    });

    it('should continue with deletion even if read fails', async () => {
      mockFileSystem.readFile.mockRejectedValue(new Error('Read failed'));
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      // Should not throw
      await command.execute();

      expect(mockFileSystem.deleteItem).toHaveBeenCalled();
    });

    it('should throw error if deletion fails', async () => {
      mockFileSystem.deleteItem.mockRejectedValue(new Error('Deletion failed'));
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      await expect(command.execute()).rejects.toThrow('Deletion failed');
    });
  });

  describe('Command Undo', () => {
    it('should restore file with original content when undone', async () => {
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      await command.execute();
      await command.undo();

      expect(mockFileSystem.createFile).toHaveBeenCalledWith(
        projectId,
        filePath,
        fileContent
      );
    });

    it('should restore empty file if content was not read', async () => {
      mockFileSystem.readFile.mockRejectedValue(new Error('Read failed'));
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      await command.execute();
      await command.undo();

      expect(mockFileSystem.createFile).toHaveBeenCalledWith(
        projectId,
        filePath,
        ''
      );
    });

    it('should throw error if file recreation fails during undo', async () => {
      mockFileSystem.createFile.mockRejectedValue(new Error('Creation failed'));
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      await command.execute();
      await expect(command.undo()).rejects.toThrow('Creation failed');
    });
  });

  describe('Command Properties', () => {
    it('should return correct description', () => {
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      expect(command.getDescription()).toBe(`Delete file "${filePath}"`);
    });

    it('should always be undoable', () => {
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      expect(command.canUndo()).toBe(true);
    });
  });

  describe('Command Serialization', () => {
    it('should serialize command with correct metadata', async () => {
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      await command.execute();
      const serialized = command.serialize();

      expect(serialized.type).toBe('DELETE_FILE');
      expect(serialized.userId).toBe(userId);
      expect(serialized.projectId).toBe(projectId);
      expect(serialized.metadata.filePath).toBe(filePath);
      expect(serialized.metadata.deletedSize).toBeGreaterThan(0);
      expect(serialized.metadata.deletedName).toBe('file.txt');
      expect(serialized.timestamp).toBeGreaterThan(0);
    });

    it('should handle missing metadata in serialization', async () => {
      mockFileSystem.readFile.mockRejectedValue(new Error('Read failed'));
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      await command.execute();
      const serialized = command.serialize();

      expect(serialized.metadata.deletedSize).toBe(0);
      expect(serialized.metadata.deletedName).toBe('');
    });
  });

  describe('Command Lifecycle', () => {
    it('should support execute -> undo -> redo cycle', async () => {
      const command = new DeleteFileCommand(
        userId,
        projectId,
        filePath,
        mockFileSystem
      );

      // Execute
      await command.execute();
      expect(mockFileSystem.deleteItem).toHaveBeenCalledTimes(1);

      // Undo (restore)
      await command.undo();
      expect(mockFileSystem.createFile).toHaveBeenCalledTimes(1);

      // Redo (delete again)
      await command.redo();
      expect(mockFileSystem.deleteItem).toHaveBeenCalledTimes(2);
    });
  });
});

