/**
 * DuplicateFileCommand Unit Tests
 * 
 * Tests the DuplicateFileCommand implementation of the Command pattern.
 */

import { DuplicateFileCommand } from '../app/lib/commands/DuplicateFileCommand';

describe('DuplicateFileCommand', () => {
  const userId = 'user123';
  const projectId = 'project456';
  const sourcePath = 'test/source.txt';
  const destinationPath = 'test/destination.txt';
  const fileContent = 'Original file content';

  let mockFileSystem: {
    readFile: jest.Mock;
    createFile: jest.Mock;
    deleteItem: jest.Mock;
  };
  let onFileDuplicated: jest.Mock;

  beforeEach(() => {
    mockFileSystem = {
      readFile: jest.fn().mockResolvedValue(fileContent),
      createFile: jest.fn().mockResolvedValue(undefined),
      deleteItem: jest.fn().mockResolvedValue(undefined),
    };
    onFileDuplicated = jest.fn();
  });

  describe('Command Execution', () => {
    it('should read source file and create duplicate', async () => {
      const command = new DuplicateFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await command.execute();

      expect(mockFileSystem.readFile).toHaveBeenCalledWith(
        projectId,
        sourcePath
      );
      expect(mockFileSystem.createFile).toHaveBeenCalledWith(
        projectId,
        destinationPath,
        fileContent
      );
    });

    it('should call onFileDuplicated callback when provided', async () => {
      const command = new DuplicateFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem,
        onFileDuplicated
      );

      await command.execute();

      expect(onFileDuplicated).toHaveBeenCalledWith(sourcePath, destinationPath);
      expect(onFileDuplicated).toHaveBeenCalledTimes(1);
    });

    it('should not call onFileDuplicated if not provided', async () => {
      const command = new DuplicateFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await command.execute();

      expect(onFileDuplicated).not.toHaveBeenCalled();
    });

    it('should throw error if read fails', async () => {
      mockFileSystem.readFile.mockRejectedValue(new Error('Read failed'));
      const command = new DuplicateFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await expect(command.execute()).rejects.toThrow('Read failed');
    });

    it('should throw error if create fails', async () => {
      mockFileSystem.createFile.mockRejectedValue(new Error('Create failed'));
      const command = new DuplicateFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      await expect(command.execute()).rejects.toThrow('Create failed');
    });
  });

  describe('Command Undo', () => {
    it('should delete the duplicated file when undone', async () => {
      const command = new DuplicateFileCommand(
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
      const command = new DuplicateFileCommand(
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
      const command = new DuplicateFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      expect(command.getDescription()).toBe('Duplicate "source.txt" to "destination.txt"');
    });

    it('should handle nested paths in description', () => {
      const command = new DuplicateFileCommand(
        userId,
        projectId,
        'folder/subfolder/source.txt',
        'folder/subfolder/dest.txt',
        mockFileSystem
      );

      expect(command.getDescription()).toBe('Duplicate "source.txt" to "dest.txt"');
    });

    it('should always be undoable', () => {
      const command = new DuplicateFileCommand(
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
      const command = new DuplicateFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      const serialized = command.serialize();

      expect(serialized.type).toBe('DUPLICATE_FILE');
      expect(serialized.userId).toBe(userId);
      expect(serialized.projectId).toBe(projectId);
      expect(serialized.metadata.sourcePath).toBe(sourcePath);
      expect(serialized.metadata.destinationPath).toBe(destinationPath);
      expect(serialized.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Command Lifecycle', () => {
    it('should support execute -> undo -> redo cycle', async () => {
      const command = new DuplicateFileCommand(
        userId,
        projectId,
        sourcePath,
        destinationPath,
        mockFileSystem
      );

      // Execute
      await command.execute();
      expect(mockFileSystem.readFile).toHaveBeenCalledTimes(1);
      expect(mockFileSystem.createFile).toHaveBeenCalledTimes(1);

      // Undo
      await command.undo();
      expect(mockFileSystem.deleteItem).toHaveBeenCalledTimes(1);

      // Redo
      await command.redo();
      expect(mockFileSystem.readFile).toHaveBeenCalledTimes(2);
      expect(mockFileSystem.createFile).toHaveBeenCalledTimes(2);
    });
  });
});

