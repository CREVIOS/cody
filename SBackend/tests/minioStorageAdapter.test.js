/**
 * MinIOStorageAdapter Test Suite
 * Tests the MinIO storage adapter implementation
 *
 * This test suite verifies that MinIOStorageAdapter correctly:
 * - Initializes MinIO client
 * - Handles bucket operations
 * - Implements all storage adapter methods
 * - Handles errors gracefully
 */

const MinIOStorageAdapter = require('../adapters/minioStorageAdapter');

// Mock MinIO client
const mockMinioClient = {
  bucketExists: jest.fn(),
  makeBucket: jest.fn(),
  getObject: jest.fn(),
  putObject: jest.fn(),
  removeObject: jest.fn(),
  removeObjects: jest.fn(),
  listObjects: jest.fn(),
  statObject: jest.fn(),
  copyObject: jest.fn(),
  listObjectsV2: jest.fn(),
  getBucketVersioning: jest.fn(),
  setBucketVersioning: jest.fn(),
};

jest.mock('minio', () => {
  return {
    Client: jest.fn().mockImplementation(() => mockMinioClient),
  };
});

describe('MinIOStorageAdapter', () => {
  let adapter;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    adapter = new MinIOStorageAdapter({
      bucketName: 'test-bucket',
      minioClient: mockMinioClient,
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Constructor', () => {
    it('should create adapter with default bucket name', () => {
      const defaultAdapter = new MinIOStorageAdapter();
      expect(defaultAdapter.bucketName).toBe('projects');
    });

    it('should create adapter with custom bucket name', () => {
      expect(adapter.bucketName).toBe('test-bucket');
    });

    it('should use provided MinIO client', () => {
      expect(adapter.minioClient).toBe(mockMinioClient);
    });
  });

  describe('_objectName', () => {
    it('should format object name correctly', () => {
      const objectName = adapter._objectName('project1', 'file.txt');
      expect(objectName).toBe('project1/file.txt');
    });

    it('should handle file path with leading slash', () => {
      const objectName = adapter._objectName('project1', '/file.txt');
      expect(objectName).toBe('project1/file.txt');
    });

    it('should handle empty file path', () => {
      const objectName = adapter._objectName('project1', '');
      expect(objectName).toBe('project1/');
    });

    it('should handle null file path', () => {
      const objectName = adapter._objectName('project1', null);
      expect(objectName).toBe('project1/');
    });
  });

  describe('init', () => {
    it('should create bucket if it does not exist', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false);
      mockMinioClient.makeBucket.mockResolvedValue();

      await adapter.init();

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith('test-bucket');
      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith('test-bucket', 'us-east-1');
    });

    it('should not create bucket if it exists', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);

      await adapter.init();

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith('test-bucket');
      expect(mockMinioClient.makeBucket).not.toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      mockMinioClient.bucketExists.mockRejectedValue(new Error('Connection failed'));

      await adapter.init();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('readFile', () => {
    it('should read file content', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('file content');
        },
      };
      mockMinioClient.getObject.mockResolvedValue(mockStream);

      const content = await adapter.readFile('project1', 'file.txt');

      expect(content).toBe('file content');
      expect(mockMinioClient.getObject).toHaveBeenCalledWith('test-bucket', 'project1/file.txt', undefined);
    });

    it('should read file with version ID', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('versioned content');
        },
      };
      mockMinioClient.getObject.mockResolvedValue(mockStream);

      const content = await adapter.readFile('project1', 'file.txt', { versionId: 'v123' });

      expect(content).toBe('versioned content');
      expect(mockMinioClient.getObject).toHaveBeenCalledWith('test-bucket', 'project1/file.txt', { versionId: 'v123' });
    });

    it('should handle read errors', async () => {
      mockMinioClient.getObject.mockRejectedValue(new Error('File not found'));

      await expect(adapter.readFile('project1', 'file.txt')).rejects.toThrow('File not found');
    });
  });

  describe('writeFile', () => {
    it('should write file content', async () => {
      mockMinioClient.putObject.mockResolvedValue();
      mockMinioClient.statObject.mockResolvedValue({
        versionId: 'v1',
        etag: 'etag1',
        lastModified: new Date(),
      });

      const result = await adapter.writeFile('project1', 'file.txt', 'file content');

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'test-bucket',
        'project1/file.txt',
        expect.any(Buffer),
        expect.any(Number),
        expect.any(Object)
      );
      expect(result.versionId).toBe('v1');
    });

    it('should write file with metadata', async () => {
      mockMinioClient.putObject.mockResolvedValue();
      mockMinioClient.statObject.mockResolvedValue({
        versionId: 'v1',
        etag: 'etag1',
        lastModified: new Date(),
      });

      await adapter.writeFile('project1', 'file.txt', 'content', { contentType: 'text/plain' });

      expect(mockMinioClient.putObject).toHaveBeenCalled();
    });

    it('should handle write errors', async () => {
      mockMinioClient.putObject.mockRejectedValue(new Error('Write failed'));

      await expect(adapter.writeFile('project1', 'file.txt', 'content')).rejects.toThrow('Write failed');
    });
  });

  describe('deleteFile', () => {
    it('should delete single file when no objects found', async () => {
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          // Empty iterator
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);
      mockMinioClient.removeObject.mockResolvedValue();

      const result = await adapter.deleteFile('project1', 'file.txt');

      expect(result.deleted).toBe(1);
      expect(mockMinioClient.removeObject).toHaveBeenCalledWith('test-bucket', 'project1/file.txt');
    });

    it('should delete multiple files when objects found', async () => {
      const mockObjects = [
        { name: 'project1/file.txt' },
        { name: 'project1/file2.txt' },
      ];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);
      mockMinioClient.removeObjects.mockResolvedValue();

      const result = await adapter.deleteFile('project1', '');

      expect(result.deleted).toBe(2);
      expect(mockMinioClient.removeObjects).toHaveBeenCalledWith('test-bucket', ['project1/file.txt', 'project1/file2.txt']);
    });

    it('should handle delete errors', async () => {
      mockMinioClient.listObjects.mockImplementation(() => {
        throw new Error('Delete failed');
      });

      await expect(adapter.deleteFile('project1', 'file.txt')).rejects.toThrow('Delete failed');
    });
  });

  describe('listFiles', () => {
    it('should list files in project', async () => {
      const mockObjects = [
        { name: 'project1/file1.txt', lastModified: new Date(), size: 100, etag: 'etag1' },
        { name: 'project1/file2.txt', lastModified: new Date(), size: 200, etag: 'etag2' },
      ];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);

      const files = await adapter.listFiles('project1');

      expect(files).toHaveLength(2);
      expect(files[0].path).toBe('file1.txt');
      expect(files[1].path).toBe('file2.txt');
      expect(mockMinioClient.listObjects).toHaveBeenCalledWith('test-bucket', 'project1/', true, undefined);
    });

    it('should list files with prefix', async () => {
      const mockObjects = [{ name: 'project1/sub/file.txt', size: 100 }];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);

      const files = await adapter.listFiles('project1', 'sub/');

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('sub/file.txt');
      expect(mockMinioClient.listObjects).toHaveBeenCalledWith('test-bucket', 'project1/sub/', true, undefined);
    });

    it('should handle list errors', async () => {
      mockMinioClient.listObjects.mockImplementation(() => {
        throw new Error('List failed');
      });

      await expect(adapter.listFiles('project1')).rejects.toThrow('List failed');
    });
  });

  describe('statFile', () => {
    it('should get file stats', async () => {
      const mockStats = {
        size: 100,
        lastModified: new Date(),
        etag: 'etag123',
        versionId: 'v1',
        metaData: {},
      };
      mockMinioClient.statObject.mockResolvedValue(mockStats);

      const stats = await adapter.statFile('project1', 'file.txt');

      expect(stats).toEqual({
        size: 100,
        lastModified: mockStats.lastModified,
        etag: 'etag123',
        versionId: 'v1',
        metaData: {},
      });
      expect(mockMinioClient.statObject).toHaveBeenCalledWith('test-bucket', 'project1/file.txt', undefined);
    });

    it('should get file stats with version ID', async () => {
      const mockStats = { size: 100, lastModified: new Date(), etag: null, versionId: 'v123', metaData: {} };
      mockMinioClient.statObject.mockResolvedValue(mockStats);

      const stats = await adapter.statFile('project1', 'file.txt', { versionId: 'v123' });

      expect(stats.versionId).toBe('v123');
      expect(mockMinioClient.statObject).toHaveBeenCalledWith('test-bucket', 'project1/file.txt', { versionId: 'v123' });
    });

    it('should handle stat errors', async () => {
      mockMinioClient.statObject.mockRejectedValue(new Error('Stat failed'));

      await expect(adapter.statFile('project1', 'file.txt')).rejects.toThrow('Stat failed');
    });
  });

  describe('copyItem', () => {
    it('should copy file', async () => {
      const mockObjects = [{ name: 'project1/source.txt' }];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);
      mockMinioClient.copyObject.mockResolvedValue();

      await adapter.copyItem('project1', 'source.txt', 'dest.txt');

      expect(mockMinioClient.copyObject).toHaveBeenCalled();
    });

    it('should throw error if source not found', async () => {
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          // Empty iterator
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);

      await expect(adapter.copyItem('project1', 'source.txt', 'dest.txt')).rejects.toThrow('Source item not found');
    });

    it('should handle copy errors', async () => {
      const mockObjects = [{ name: 'project1/source.txt' }];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);
      mockMinioClient.copyObject.mockRejectedValue(new Error('Copy failed'));

      await expect(adapter.copyItem('project1', 'source.txt', 'dest.txt')).rejects.toThrow('Copy failed');
    });
  });

  describe('renameItem', () => {
    it('should rename file by copying and deleting', async () => {
      // Mock copyItem (which uses listObjects and copyObject)
      const mockObjects = [{ name: 'project1/old.txt' }];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        },
      };
      mockMinioClient.listObjects.mockReturnValueOnce(asyncIterable);
      mockMinioClient.copyObject.mockResolvedValue();
      
      // Mock deleteFile (which uses listObjects and removeObject/removeObjects)
      const asyncIterable2 = {
        [Symbol.asyncIterator]: async function* () {
          // Empty for deleteFile
        },
      };
      mockMinioClient.listObjects.mockReturnValueOnce(asyncIterable2);
      mockMinioClient.removeObject.mockResolvedValue();

      await adapter.renameItem('project1', 'old.txt', 'new.txt');

      expect(mockMinioClient.copyObject).toHaveBeenCalled();
      expect(mockMinioClient.removeObject).toHaveBeenCalled();
    });

    it('should handle rename errors', async () => {
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          // Empty - source not found
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);

      await expect(adapter.renameItem('project1', 'old.txt', 'new.txt')).rejects.toThrow('Source item not found');
    });
  });

  describe('listProjects', () => {
    it('should list all projects', async () => {
      const mockObjects = [
        { name: 'project1/', prefix: 'project1/' },
        { name: 'project2/', prefix: 'project2/' },
      ];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);

      const projects = await adapter.listProjects();

      expect(projects).toHaveLength(2);
      expect(projects[0].id).toBe('project1');
      expect(projects[1].id).toBe('project2');
      expect(mockMinioClient.listObjects).toHaveBeenCalledWith('test-bucket', '', false);
    });

    it('should handle list projects errors', async () => {
      mockMinioClient.listObjects.mockImplementation(() => {
        throw new Error('List projects failed');
      });

      await expect(adapter.listProjects()).rejects.toThrow('List projects failed');
    });
  });

  describe('deleteProject', () => {
    it('should delete all files in project', async () => {
      const mockObjects = [
        { name: 'project1/file1.txt' },
        { name: 'project1/file2.txt' },
      ];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);
      mockMinioClient.removeObjects.mockResolvedValue();

      await adapter.deleteProject('project1');

      expect(mockMinioClient.removeObjects).toHaveBeenCalledWith('test-bucket', ['project1/file1.txt', 'project1/file2.txt']);
    });

    it('should handle delete project errors', async () => {
      mockMinioClient.listObjects.mockImplementation(() => {
        throw new Error('Delete project failed');
      });

      await expect(adapter.deleteProject('project1')).rejects.toThrow('Delete project failed');
    });
  });

  describe('projectExists', () => {
    it('should check if project exists', async () => {
      const mockObjects = [{ name: 'project1/file.txt' }];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockObjects) {
            yield obj;
          }
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);

      const exists = await adapter.projectExists('project1');

      expect(exists).toBe(true);
    });

    it('should return false if project does not exist', async () => {
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          // Empty iterator
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);

      const exists = await adapter.projectExists('project1');

      expect(exists).toBe(false);
    });
  });

  describe('getVersions', () => {
    it('should get file versions', async () => {
      const mockVersions = [
        { name: 'project1/file.txt', versionId: 'v1', lastModified: new Date(), size: 100, etag: 'etag1' },
        { name: 'project1/file.txt', versionId: 'v2', lastModified: new Date(), size: 200, etag: 'etag2' },
      ];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const obj of mockVersions) {
            yield obj;
          }
        },
      };
      mockMinioClient.listObjects.mockReturnValue(asyncIterable);

      const versions = await adapter.getVersions('project1', 'file.txt');

      expect(versions).toHaveLength(2);
      expect(versions[0].versionId).toBe('v1');
      expect(versions[1].versionId).toBe('v2');
    });
  });

  describe('getVersion', () => {
    it('should get specific version', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('version content');
        },
      };
      mockMinioClient.getObject.mockResolvedValue(mockStream);
      mockMinioClient.statObject.mockResolvedValue({
        size: 100,
        lastModified: new Date(),
        etag: 'etag123',
        versionId: 'v123',
        metaData: {},
      });

      const result = await adapter.getVersion('project1', 'file.txt', 'v123');

      expect(result.content).toBe('version content');
      expect(result.metadata.size).toBe(100);
      expect(result.metadata.etag).toBe('etag123');
    });
  });

  describe('restoreVersion', () => {
    it('should restore version by copying', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('version content');
        },
      };
      mockMinioClient.getObject.mockResolvedValue(mockStream);
      mockMinioClient.statObject.mockResolvedValue({
        size: 100,
        lastModified: new Date(),
        etag: 'etag123',
        versionId: 'v123',
        metaData: {},
      });
      mockMinioClient.putObject.mockResolvedValue();
      mockMinioClient.statObject.mockResolvedValueOnce({
        versionId: 'v1',
        etag: 'etag1',
        lastModified: new Date(),
      });

      await adapter.restoreVersion('project1', 'file.txt', 'v123');

      expect(mockMinioClient.getObject).toHaveBeenCalled();
      expect(mockMinioClient.putObject).toHaveBeenCalled();
    });
  });

  describe('deleteVersion', () => {
    it('should delete specific version', async () => {
      mockMinioClient.removeObject.mockResolvedValue();

      await adapter.deleteVersion('project1', 'file.txt', 'v123');

      expect(mockMinioClient.removeObject).toHaveBeenCalled();
    });
  });

  describe('getVersioningStatus', () => {
    it('should get versioning status', async () => {
      mockMinioClient.getBucketVersioning.mockResolvedValue({ Status: 'Enabled' });

      const status = await adapter.getVersioningStatus();

      expect(status).toEqual({
        bucket: 'test-bucket',
        status: 'Enabled',
        mfaDelete: 'Disabled',
      });
      expect(mockMinioClient.getBucketVersioning).toHaveBeenCalledWith('test-bucket');
    });
  });

  describe('enableVersioning', () => {
    it('should enable versioning', async () => {
      mockMinioClient.setBucketVersioning.mockResolvedValue();

      await adapter.enableVersioning();

      expect(mockMinioClient.setBucketVersioning).toHaveBeenCalledWith('test-bucket', { Status: 'Enabled' });
    });
  });
});

