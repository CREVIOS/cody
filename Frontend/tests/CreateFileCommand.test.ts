/**
 * CreateFileCommand Unit Tests
 * 
 * Tests the CreateFileCommand implementation of the Command pattern.
 */

import { CreateFileCommand } from '../app/lib/commands/CreateFileCommand';

describe('CreateFileCommand', () => {
  const userId = 'user123';
  const projectId = 'project456';
  const filePath = 'test/file.txt';
  const content = 'Test file content';

  let mockFileSystem: {
    createFile: jest.Mock;
    deleteItem: jest.Mock;
  };
  let onFileCreated: jest.Mock;

  beforeEach(() => {
    mockFileSystem = {
      createFile: jest.fn().mockResolvedValue(undefined),
      deleteItem: jest.fn().mockResolvedValue(undefined),
    };
    onFileCreated = jest.fn();
  });

  describe('Command Execution', () => {
    it('should create a file when executed', async () => {
      const command = new CreateFileCommand(
        userId,
        projectId,
        filePath,
        content,
        mockFileSystem
      );

      await command.execute();

      expect(mockFileSystem.createFile).toHaveBeenCalledWith(
        projectId,
        filePath,
        content
      );
      expect(mockFileSystem.createFile).toHaveBeenCalledTimes(1);
    });

    it('should call onFileCreated callback when provided', async () => {
      const command = new CreateFileCommand(
        userId,
        projectId,
        filePath,
        content,
        mockFileSystem,
        onFileCreated
      );

      await command.execute();

      expect(onFileCreated).toHaveBeenCalledWith(filePath);
      expect(onFileCreated).toHaveBeenCalledTimes(1);
    });

    it('should not call onFileCreated if not provided', async () => {
      const command = new CreateFileCommand(
        userId,
        projectId,
        filePath,
        content,
        mockFileSystem
      );

      await command.execute();

      expect(onFileCreated).not.toHaveBeenCalled();
    });

    it('should throw error if file creation fails', async () => {
      mockFileSystem.createFile.mockRejectedValue(new Error('Creation failed'));
      const command = new CreateFileCommand(
        userId,
        projectId,
        filePath,
        content,
        mockFileSystem
      );

      await expect(command.execute()).rejects.toThrow('Creation failed');
    });
  });

  describe('Command Undo', () => {
    it('should delete the created file when undone', async () => {
      const command = new CreateFileCommand(
        userId,
        projectId,
        filePath,
        content,
        mockFileSystem
      );

      await command.execute();
      await command.undo();

      expect(mockFileSystem.deleteItem).toHaveBeenCalledWith(
        projectId,
        filePath
      );
      expect(mockFileSystem.deleteItem).toHaveBeenCalledTimes(1);
    });

    it('should throw error if deletion fails during undo', async () => {
      mockFileSystem.deleteItem.mockRejectedValue(new Error('Deletion failed'));
      const command = new CreateFileCommand(
        userId,
        projectId,
        filePath,
        content,
        mockFileSystem
      );

      await command.execute();
      await expect(command.undo()).rejects.toThrow('Deletion failed');
    });
  });

  describe('Command Properties', () => {
    it('should return correct description', () => {
      const command = new CreateFileCommand(
        userId,
        projectId,
        filePath,
        content,
        mockFileSystem
      );

      expect(command.getDescription()).toBe('Create file "file.txt"');
    });

    it('should handle file path without extension in description', () => {
      const command = new CreateFileCommand(
        userId,
        projectId,
        'test/file',
        content,
        mockFileSystem
      );

      expect(command.getDescription()).toBe('Create file "file"');
    });

    it('should handle nested file paths in description', () => {
      const command = new CreateFileCommand(
        userId,
        projectId,
        'folder/subfolder/file.txt',
        content,
        mockFileSystem
      );

      expect(command.getDescription()).toBe('Create file "file.txt"');
    });

    it('should always be undoable', () => {
      const command = new CreateFileCommand(
        userId,
        projectId,
        filePath,
        content,
        mockFileSystem
      );

      expect(command.canUndo()).toBe(true);
    });
  });

  describe('Command Serialization', () => {
    it('should serialize command with correct metadata', () => {
      const command = new CreateFileCommand(
        userId,
        projectId,
        filePath,
        content,
        mockFileSystem
      );

      const serialized = command.serialize();

      expect(serialized.type).toBe('CREATE_FILE');
      expect(serialized.userId).toBe(userId);
      expect(serialized.projectId).toBe(projectId);
      expect(serialized.metadata.filePath).toBe(filePath);
      expect(serialized.metadata.contentLength).toBe(content.length);
      expect(serialized.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Command Lifecycle', () => {
    it('should support execute -> undo -> redo cycle', async () => {
      const command = new CreateFileCommand(
        userId,
        projectId,
        filePath,
        content,
        mockFileSystem
      );

      // Execute
      await command.execute();
      expect(mockFileSystem.createFile).toHaveBeenCalledTimes(1);

      // Undo
      await command.undo();
      expect(mockFileSystem.deleteItem).toHaveBeenCalledTimes(1);

      // Redo
      await command.redo();
      expect(mockFileSystem.createFile).toHaveBeenCalledTimes(2);
    });
  });
});

