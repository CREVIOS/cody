/**
 * CreateFolderCommand Unit Tests
 * 
 * Tests the CreateFolderCommand implementation of the Command pattern.
 */

import { CreateFolderCommand } from '../app/lib/commands/CreateFolderCommand';

describe('CreateFolderCommand', () => {
  const userId = 'user123';
  const projectId = 'project456';
  const folderPath = 'test/newfolder';

  let mockFileSystem: {
    createFolder: jest.Mock;
    deleteItem: jest.Mock;
  };
  let onFolderCreated: jest.Mock;

  beforeEach(() => {
    mockFileSystem = {
      createFolder: jest.fn().mockResolvedValue(undefined),
      deleteItem: jest.fn().mockResolvedValue(undefined),
    };
    onFolderCreated = jest.fn();
  });

  describe('Command Execution', () => {
    it('should create a folder when executed', async () => {
      const command = new CreateFolderCommand(
        userId,
        projectId,
        folderPath,
        mockFileSystem
      );

      await command.execute();

      expect(mockFileSystem.createFolder).toHaveBeenCalledWith(
        projectId,
        folderPath
      );
      expect(mockFileSystem.createFolder).toHaveBeenCalledTimes(1);
    });

    it('should call onFolderCreated callback when provided', async () => {
      const command = new CreateFolderCommand(
        userId,
        projectId,
        folderPath,
        mockFileSystem,
        onFolderCreated
      );

      await command.execute();

      expect(onFolderCreated).toHaveBeenCalledWith(folderPath);
      expect(onFolderCreated).toHaveBeenCalledTimes(1);
    });

    it('should not call onFolderCreated if not provided', async () => {
      const command = new CreateFolderCommand(
        userId,
        projectId,
        folderPath,
        mockFileSystem
      );

      await command.execute();

      expect(onFolderCreated).not.toHaveBeenCalled();
    });

    it('should throw error if folder creation fails', async () => {
      mockFileSystem.createFolder.mockRejectedValue(new Error('Creation failed'));
      const command = new CreateFolderCommand(
        userId,
        projectId,
        folderPath,
        mockFileSystem
      );

      await expect(command.execute()).rejects.toThrow('Creation failed');
    });
  });

  describe('Command Undo', () => {
    it('should delete the created folder when undone', async () => {
      const command = new CreateFolderCommand(
        userId,
        projectId,
        folderPath,
        mockFileSystem
      );

      await command.execute();
      await command.undo();

      expect(mockFileSystem.deleteItem).toHaveBeenCalledWith(
        projectId,
        folderPath
      );
      expect(mockFileSystem.deleteItem).toHaveBeenCalledTimes(1);
    });

    it('should throw error if deletion fails during undo', async () => {
      mockFileSystem.deleteItem.mockRejectedValue(new Error('Deletion failed'));
      const command = new CreateFolderCommand(
        userId,
        projectId,
        folderPath,
        mockFileSystem
      );

      await command.execute();
      await expect(command.undo()).rejects.toThrow('Deletion failed');
    });
  });

  describe('Command Properties', () => {
    it('should return correct description', () => {
      const command = new CreateFolderCommand(
        userId,
        projectId,
        folderPath,
        mockFileSystem
      );

      expect(command.getDescription()).toBe('Create folder "newfolder"');
    });

    it('should handle nested folder paths in description', () => {
      const command = new CreateFolderCommand(
        userId,
        projectId,
        'folder/subfolder/nested',
        mockFileSystem
      );

      expect(command.getDescription()).toBe('Create folder "nested"');
    });

    it('should always be undoable', () => {
      const command = new CreateFolderCommand(
        userId,
        projectId,
        folderPath,
        mockFileSystem
      );

      expect(command.canUndo()).toBe(true);
    });
  });

  describe('Command Serialization', () => {
    it('should serialize command with correct metadata', () => {
      const command = new CreateFolderCommand(
        userId,
        projectId,
        folderPath,
        mockFileSystem
      );

      const serialized = command.serialize();

      expect(serialized.type).toBe('CREATE_FOLDER');
      expect(serialized.userId).toBe(userId);
      expect(serialized.projectId).toBe(projectId);
      expect(serialized.metadata.folderPath).toBe(folderPath);
      expect(serialized.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Command Lifecycle', () => {
    it('should support execute -> undo -> redo cycle', async () => {
      const command = new CreateFolderCommand(
        userId,
        projectId,
        folderPath,
        mockFileSystem
      );

      // Execute
      await command.execute();
      expect(mockFileSystem.createFolder).toHaveBeenCalledTimes(1);

      // Undo
      await command.undo();
      expect(mockFileSystem.deleteItem).toHaveBeenCalledTimes(1);

      // Redo
      await command.redo();
      expect(mockFileSystem.createFolder).toHaveBeenCalledTimes(2);
    });
  });
});

