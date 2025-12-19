const FileSystemService = require('../services/fileSystemService');
const MockStorageAdapter = require('../adapters/mockStorageAdapter');

describe('FileSystemService', () => {
  let fileSystemService;
  let mockStorage;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    mockStorage = new MockStorageAdapter();
    fileSystemService = new FileSystemService(mockStorage);
  });

  describe('constructor', () => {
    it('should initialize with injected storage adapter', () => {
      expect(fileSystemService.storage).toBe(mockStorage);
    });
  });

  describe('initializeBucket', () => {
    it('should delegate to adapter init when present', async () => {
      const spy = jest.spyOn(mockStorage, 'init').mockResolvedValue();
      await fileSystemService.initializeBucket();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildFileTree', () => {
    it('should build correct file tree from flat object list', () => {
      const objects = [
        { name: 'project1/file1.txt', size: 100, lastModified: new Date() },
        { name: 'project1/folder1/file2.txt', size: 200, lastModified: new Date() },
        { name: 'project1/folder1/subfolder/file3.txt', size: 300, lastModified: new Date() }
      ];
      const prefix = 'project1/';

      const tree = fileSystemService.buildFileTree(objects, prefix);

      expect(tree).toHaveLength(2); // file1.txt and folder1
      expect(tree[0].name).toBe('file1.txt');
      expect(tree[0].type).toBe('file');
      expect(tree[1].name).toBe('folder1');
      expect(tree[1].type).toBe('folder');
      expect(tree[1].children).toHaveLength(2); // file2.txt and subfolder
    });

    it('should filter out .gitkeep files', () => {
      const objects = [
        { name: 'project1/folder1/.gitkeep', size: 0, lastModified: new Date() },
        { name: 'project1/file1.txt', size: 100, lastModified: new Date() }
      ];
      const prefix = 'project1/';

      const tree = fileSystemService.buildFileTree(objects, prefix);

      // Should have the folder (without .gitkeep) and the file
      expect(tree).toHaveLength(2);
      expect(tree.find(item => item.name === 'file1.txt')).toBeDefined();
      expect(tree.find(item => item.name === 'folder1')).toBeDefined();
      
      // The folder should exist but have no children (since .gitkeep was filtered out)
      const folder = tree.find(item => item.name === 'folder1');
      expect(folder.children).toHaveLength(0);
    });
  });

  describe('getProjectStructure', () => {
    it('should return project structure successfully', async () => {
      const listFilesSpy = jest.spyOn(mockStorage, 'listFiles').mockResolvedValue([
        { path: 'file1.txt', size: 100, lastModified: new Date() }
      ]);

      const result = await fileSystemService.getProjectStructure('project1');

      expect(listFilesSpy).toHaveBeenCalledWith('project1', '', { recursive: true });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('file1.txt');
    });

    it('should handle errors when getting project structure', async () => {
      jest.spyOn(mockStorage, 'listFiles').mockRejectedValue(new Error('Storage error'));

      await expect(fileSystemService.getProjectStructure('project1')).rejects.toThrow('Storage error');
    });
  });

  describe('createFile', () => {
    it('should create file successfully', async () => {
      const writeSpy = jest.spyOn(mockStorage, 'writeFile').mockResolvedValue({
        versionId: '1',
        etag: 'etag',
        lastModified: new Date(),
        size: 11
      });

      const result = await fileSystemService.createFile('project1', 'test.txt', 'Hello World');

      expect(writeSpy).toHaveBeenCalledWith('project1', 'test.txt', 'Hello World', { contentType: 'text/plain' });
      expect(result.success).toBe(true);
      expect(result.path).toBe('test.txt');
    });

    it('should create file with empty content by default', async () => {
      const writeSpy = jest.spyOn(mockStorage, 'writeFile').mockResolvedValue({
        versionId: '1',
        etag: 'etag',
        lastModified: new Date(),
        size: 0
      });

      const result = await fileSystemService.createFile('project1', 'empty.txt');

      expect(writeSpy).toHaveBeenCalledWith('project1', 'empty.txt', '', { contentType: 'text/plain' });
      expect(result.success).toBe(true);
    });

    it('should handle file creation errors', async () => {
      jest.spyOn(mockStorage, 'writeFile').mockRejectedValue(new Error('Upload failed'));

      await expect(fileSystemService.createFile('project1', 'test.txt', 'content')).rejects.toThrow('Upload failed');
    });
  });

  describe('createFolder', () => {
    it('should create folder successfully', async () => {
      const writeSpy = jest.spyOn(mockStorage, 'writeFile').mockResolvedValue({
        versionId: '1',
        etag: 'etag',
        lastModified: new Date(),
        size: 0
      });

      const result = await fileSystemService.createFolder('project1', 'newfolder');

      expect(writeSpy).toHaveBeenCalledWith('project1', 'newfolder/.gitkeep', '', { contentType: 'text/plain' });
      expect(result.success).toBe(true);
      expect(result.path).toBe('newfolder');
    });

    it('should handle folder creation errors', async () => {
      jest.spyOn(mockStorage, 'writeFile').mockRejectedValue(new Error('Folder creation failed'));

      await expect(fileSystemService.createFolder('project1', 'newfolder')).rejects.toThrow('Folder creation failed');
    });
  });

  describe('readFile', () => {
    it('should read file content successfully', async () => {
      const mockContent = 'File content';
      const readSpy = jest.spyOn(mockStorage, 'readFile').mockResolvedValue(mockContent);

      const result = await fileSystemService.readFile('project1', 'test.txt');

      expect(readSpy).toHaveBeenCalledWith('project1', 'test.txt');
      expect(result.success).toBe(true);
      expect(result.content).toBe(mockContent);
      expect(result.path).toBe('test.txt');
    });

    it('should handle file reading errors', async () => {
      jest.spyOn(mockStorage, 'readFile').mockRejectedValue(new Error('File not found'));

      await expect(fileSystemService.readFile('project1', 'nonexistent.txt')).rejects.toThrow('File not found');
    });
  });

  describe('updateFile', () => {
    it('should update file successfully', async () => {
      const meta = { versionId: '2', etag: 'etag2', lastModified: new Date(), size: 15 };
      const writeSpy = jest.spyOn(mockStorage, 'writeFile').mockResolvedValue(meta);

      const result = await fileSystemService.updateFile('project1', 'test.txt', 'Updated content');

      expect(writeSpy).toHaveBeenCalledWith('project1', 'test.txt', 'Updated content', { contentType: 'text/plain' });
      expect(result.success).toBe(true);
      expect(result.path).toBe('test.txt');
      expect(result.versionId).toBe(meta.versionId);
    });

    it('should handle file update errors', async () => {
      jest.spyOn(mockStorage, 'writeFile').mockRejectedValue(new Error('Update failed'));

      await expect(fileSystemService.updateFile('project1', 'test.txt', 'content')).rejects.toThrow('Update failed');
    });
  });

  describe('deleteItem', () => {
    it('should delete single file successfully', async () => {
      const delSpy = jest.spyOn(mockStorage, 'deleteFile').mockResolvedValue({ deleted: 1 });

      const result = await fileSystemService.deleteItem('project1', 'test.txt');

      expect(delSpy).toHaveBeenCalledWith('project1', 'test.txt');
      expect(result.success).toBe(true);
    });

    it('should delete folder with multiple files successfully', async () => {
      const delSpy = jest.spyOn(mockStorage, 'deleteFile').mockResolvedValue({ deleted: 2 });

      const result = await fileSystemService.deleteItem('project1', 'folder');

      expect(delSpy).toHaveBeenCalledWith('project1', 'folder');
      expect(result.success).toBe(true);
    });

    it('should handle deletion errors', async () => {
      jest.spyOn(mockStorage, 'deleteFile').mockRejectedValue(new Error('Delete failed'));

      await expect(fileSystemService.deleteItem('project1', 'test.txt')).rejects.toThrow('Delete failed');
    });
  });

  describe('projectExists', () => {
    it('should return true if project exists', async () => {
      const existsSpy = jest.spyOn(mockStorage, 'projectExists').mockResolvedValue(true);

      const result = await fileSystemService.projectExists('project1');

      expect(existsSpy).toHaveBeenCalledWith('project1');
      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
    });

    it('should return false if project does not exist', async () => {
      jest.spyOn(mockStorage, 'projectExists').mockResolvedValue(false);

      const result = await fileSystemService.projectExists('nonexistent');

      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
    });

    it('should handle errors when checking project existence', async () => {
      jest.spyOn(mockStorage, 'projectExists').mockRejectedValue(new Error('Connection error'));

      await expect(fileSystemService.projectExists('project1')).rejects.toThrow('Connection error');
    });
  });

  describe('isTextFile', () => {
    it('should return true for text file extensions', () => {
      expect(fileSystemService.isTextFile('test.txt')).toBe(true);
      expect(fileSystemService.isTextFile('code.js')).toBe(true);
      expect(fileSystemService.isTextFile('style.css')).toBe(true);
      expect(fileSystemService.isTextFile('doc.md')).toBe(true);
      expect(fileSystemService.isTextFile('config.json')).toBe(true);
    });

    it('should return false for binary file extensions', () => {
      expect(fileSystemService.isTextFile('image.jpg')).toBe(false);
      expect(fileSystemService.isTextFile('video.mp4')).toBe(false);
      expect(fileSystemService.isTextFile('archive.zip')).toBe(false);
      expect(fileSystemService.isTextFile('executable.exe')).toBe(false);
    });

    it('should return false for files without extensions', () => {
      expect(fileSystemService.isTextFile('README')).toBe(false);
      expect(fileSystemService.isTextFile('Dockerfile')).toBe(false);
    });
  });
}); 
