const FileSystemService = require('../services/fileSystemService');

// Mock MinIO client
jest.mock('minio', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      bucketExists: jest.fn(),
      makeBucket: jest.fn(),
      listObjects: jest.fn(),
      putObject: jest.fn(),
      getObject: jest.fn(),
      removeObject: jest.fn(),
      removeObjects: jest.fn(),
      copyObject: jest.fn(),
      statObject: jest.fn()
    }))
  };
});

describe('FileSystemService', () => {
  let fileSystemService;
  let mockMinioClient;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    fileSystemService = new FileSystemService();
    mockMinioClient = fileSystemService.minioClient;
  });

  describe('constructor', () => {
    it('should initialize with correct MinIO configuration', () => {
      expect(fileSystemService.bucketName).toBe('projects');
      expect(mockMinioClient).toBeDefined();
    });
  });

  describe('initializeBucket', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should create bucket if it does not exist', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false);
      mockMinioClient.makeBucket.mockResolvedValue();

      await fileSystemService.initializeBucket();

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith('projects');
      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith('projects', 'us-east-1');
    });

    it('should not create bucket if it already exists', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);

      await fileSystemService.initializeBucket();

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith('projects');
      expect(mockMinioClient.makeBucket).not.toHaveBeenCalled();
    });

    it('should handle bucket initialization errors', async () => {
      mockMinioClient.bucketExists.mockRejectedValue(new Error('Connection failed'));
      
      // Should not throw, just log error
      await expect(fileSystemService.initializeBucket()).resolves.toBeUndefined();
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
      const mockObjects = [
        { name: 'project1/file1.txt', size: 100, lastModified: new Date() }
      ];
      
      // Mock async iterator
      const mockAsyncIterator = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        }
      };

      mockMinioClient.listObjects.mockReturnValue(mockAsyncIterator);

      const result = await fileSystemService.getProjectStructure('project1');

      expect(mockMinioClient.listObjects).toHaveBeenCalledWith('projects', 'project1/', true);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('file1.txt');
    });

    it('should handle errors when getting project structure', async () => {
      mockMinioClient.listObjects.mockImplementation(() => {
        throw new Error('MinIO error');
      });

      await expect(fileSystemService.getProjectStructure('project1')).rejects.toThrow('MinIO error');
    });
  });

  describe('createFile', () => {
    it('should create file successfully', async () => {
      mockMinioClient.putObject.mockResolvedValue();

      const result = await fileSystemService.createFile('project1', 'test.txt', 'Hello World');

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'projects',
        'project1/test.txt',
        expect.any(Buffer),
        11,
        { 'Content-Type': 'text/plain' }
      );
      expect(result.success).toBe(true);
      expect(result.path).toBe('test.txt');
    });

    it('should create file with empty content by default', async () => {
      mockMinioClient.putObject.mockResolvedValue();

      const result = await fileSystemService.createFile('project1', 'empty.txt');

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'projects',
        'project1/empty.txt',
        expect.any(Buffer),
        0,
        { 'Content-Type': 'text/plain' }
      );
      expect(result.success).toBe(true);
    });

    it('should handle file creation errors', async () => {
      mockMinioClient.putObject.mockRejectedValue(new Error('Upload failed'));

      await expect(fileSystemService.createFile('project1', 'test.txt', 'content')).rejects.toThrow('Upload failed');
    });
  });

  describe('createFolder', () => {
    it('should create folder successfully', async () => {
      mockMinioClient.putObject.mockResolvedValue();

      const result = await fileSystemService.createFolder('project1', 'newfolder');

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'projects',
        'project1/newfolder/.gitkeep',
        expect.any(Buffer),
        0
      );
      expect(result.success).toBe(true);
      expect(result.path).toBe('newfolder');
    });

    it('should handle folder creation errors', async () => {
      mockMinioClient.putObject.mockRejectedValue(new Error('Folder creation failed'));

      await expect(fileSystemService.createFolder('project1', 'newfolder')).rejects.toThrow('Folder creation failed');
    });
  });

  describe('readFile', () => {
    it('should read file content successfully', async () => {
      const mockContent = 'File content';
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(mockContent);
        }
      };

      mockMinioClient.getObject.mockResolvedValue(mockStream);

      const result = await fileSystemService.readFile('project1', 'test.txt');

      expect(mockMinioClient.getObject).toHaveBeenCalledWith('projects', 'project1/test.txt');
      expect(result.success).toBe(true);
      expect(result.content).toBe(mockContent);
      expect(result.path).toBe('test.txt');
    });

    it('should handle file reading errors', async () => {
      mockMinioClient.getObject.mockRejectedValue(new Error('File not found'));

      await expect(fileSystemService.readFile('project1', 'nonexistent.txt')).rejects.toThrow('File not found');
    });
  });

  describe('updateFile', () => {
    it('should update file successfully', async () => {
      mockMinioClient.putObject.mockResolvedValue();

      const result = await fileSystemService.updateFile('project1', 'test.txt', 'Updated content');

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'projects',
        'project1/test.txt',
        expect.any(Buffer),
        15,
        { 'Content-Type': 'text/plain' }
      );
      expect(result.success).toBe(true);
      expect(result.path).toBe('test.txt');
    });

    it('should handle file update errors', async () => {
      mockMinioClient.putObject.mockRejectedValue(new Error('Update failed'));

      await expect(fileSystemService.updateFile('project1', 'test.txt', 'content')).rejects.toThrow('Update failed');
    });
  });

  describe('deleteItem', () => {
    it('should delete single file successfully', async () => {
      const mockObjects = [
        { name: 'project1/test.txt' }
      ];
      
      const mockAsyncIterator = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        }
      };

      mockMinioClient.listObjects.mockReturnValue(mockAsyncIterator);
      mockMinioClient.removeObjects.mockResolvedValue();

      const result = await fileSystemService.deleteItem('project1', 'test.txt');

      expect(mockMinioClient.removeObjects).toHaveBeenCalledWith('projects', ['project1/test.txt']);
      expect(result.success).toBe(true);
    });

    it('should delete folder with multiple files successfully', async () => {
      const mockObjects = [
        { name: 'project1/folder/file1.txt' },
        { name: 'project1/folder/file2.txt' }
      ];
      
      const mockAsyncIterator = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        }
      };

      mockMinioClient.listObjects.mockReturnValue(mockAsyncIterator);
      mockMinioClient.removeObjects.mockResolvedValue();

      const result = await fileSystemService.deleteItem('project1', 'folder');

      expect(mockMinioClient.removeObjects).toHaveBeenCalledWith('projects', [
        'project1/folder/file1.txt',
        'project1/folder/file2.txt'
      ]);
      expect(result.success).toBe(true);
    });

    it('should handle deletion errors', async () => {
      mockMinioClient.listObjects.mockImplementation(() => {
        throw new Error('List failed');
      });

      await expect(fileSystemService.deleteItem('project1', 'test.txt')).rejects.toThrow('List failed');
    });
  });

  describe('projectExists', () => {
    it('should return true if project exists', async () => {
      const mockObjects = [
        { name: 'project1/file.txt' }
      ];
      
      const mockAsyncIterator = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        }
      };

      mockMinioClient.listObjects.mockReturnValue(mockAsyncIterator);

      const result = await fileSystemService.projectExists('project1');

      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
    });

    it('should return false if project does not exist', async () => {
      const mockAsyncIterator = {
        [Symbol.asyncIterator]: async function* () {
          // Empty iterator
        }
      };

      mockMinioClient.listObjects.mockReturnValue(mockAsyncIterator);

      const result = await fileSystemService.projectExists('nonexistent');

      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
    });

    it('should handle errors when checking project existence', async () => {
      mockMinioClient.listObjects.mockImplementation(() => {
        throw new Error('Connection error');
      });

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