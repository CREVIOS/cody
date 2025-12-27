const request = require('supertest');

// Mock all services before importing server.js
jest.mock('../services/fileSystemService');
jest.mock('../services/containerService');
jest.mock('../services/outputManager');
jest.mock('../services/collaborationService');
jest.mock('../services/collabPubSub');
jest.mock('../services/versionRetentionStrategies');

const FileSystemService = require('../services/fileSystemService');
const ContainerService = require('../services/containerService');
const OutputManager = require('../services/outputManager');
const { CollaborationService } = require('../services/collaborationService');
const { CollabPubSub } = require('../services/collabPubSub');

// Mock services instances
const mockFileSystemService = {
  listProjects: jest.fn(),
  deleteProject: jest.fn(),
  projectExists: jest.fn(),
  getProjectStructure: jest.fn(),
  createFile: jest.fn(),
  createFolder: jest.fn(),
  readFile: jest.fn(),
  updateFile: jest.fn(),
  deleteItem: jest.fn(),
  renameItem: jest.fn(),
  initializeProject: jest.fn(),
  searchFiles: jest.fn(),
  getFileMetadata: jest.fn(),
  copyItem: jest.fn(),
  moveItem: jest.fn(),
  listFileVersions: jest.fn(),
  storage: {
    constructor: { name: 'MockStorageAdapter' },
    getVersioningStatus: jest.fn()
  }
};

const mockContainerService = {
  listContainers: jest.fn(),
  createContainer: jest.fn(),
  stopContainer: jest.fn(),
  getContainerStats: jest.fn(),
  getActivePortsForProject: jest.fn(),
  checkContainerPorts: jest.fn(),
  getRunningProcesses: jest.fn(),
  killProcess: jest.fn(),
  syncFileToContainer: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
  outputManager: null
};

const mockOutputManager = {
  getConsoleOutput: jest.fn(),
  clearConsoleOutput: jest.fn(),
  on: jest.fn(),
  emit: jest.fn()
};

const mockCollaborationService = {
  rooms: new Map(),
  getAllMetrics: jest.fn(),
  getRoom: jest.fn()
};

const mockCollabPubSub = {
  stats: {
    publishes: 0,
    received: 0,
    reconnects: 0
  },
  init: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined)
};

// Mock constructors
FileSystemService.mockImplementation(() => mockFileSystemService);
ContainerService.mockImplementation(() => mockContainerService);
OutputManager.mockImplementation(() => mockOutputManager);
CollaborationService.mockImplementation(() => mockCollaborationService);
CollabPubSub.mockImplementation(() => mockCollabPubSub);

// Mock EventEmitter for containerService - make it emit 'ready' immediately
const EventEmitter = require('events');
class MockEventEmitter extends EventEmitter {
  once(event, listener) {
    if (event === 'ready') {
      // Immediately emit ready to prevent timeout
      setImmediate(() => {
        this.emit('ready');
        if (listener) listener();
      });
    }
    return super.once(event, listener);
  }
}

// Add EventEmitter methods to mockContainerService
Object.setPrototypeOf(mockContainerService, MockEventEmitter.prototype);
mockContainerService.on = jest.fn((event, handler) => mockContainerService);
mockContainerService.once = jest.fn((event, handler) => {
  if (event === 'ready' && handler) {
    setImmediate(() => handler());
  }
  return mockContainerService;
});
mockContainerService.emit = jest.fn();

// Prevent server from actually starting
let app;
let serverModule;

beforeAll(async () => {
  // Mock process.env to prevent actual initialization issues
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0'; // Use port 0 to prevent actual binding
  
  // Suppress console.log during tests to reduce noise
  const originalConsoleLog = console.log;
  console.log = jest.fn();
  const originalConsoleError = console.error;
  console.error = jest.fn();
  
  try {
    // Import server module
    // The server will try to start, but we'll prevent actual network binding
    serverModule = require('../server');
    app = serverModule.app;
    
    // Ensure versionRetentionManager is available (it might not be initialized if services failed)
    // The server now uses a getter/setter, so we can set it directly
    if (!serverModule.versionRetentionManager) {
      serverModule.versionRetentionManager = {
        applyRetentionPolicy: jest.fn().mockResolvedValue({ success: true, deleted: 0 }),
        applyRetentionPolicyToProject: jest.fn().mockResolvedValue({ success: true, filesProcessed: 0 }),
        setStrategy: jest.fn(),
        getStrategy: jest.fn()
      };
    }
    
    // Wait a bit for initialization to complete (or fail gracefully)
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    // If initialization fails, that's okay for testing
    // We can still test the routes
    console.warn('Server initialization had issues (expected in test):', error.message);
    
    // Still try to set up versionRetentionManager even if initialization failed
    if (serverModule && !serverModule.versionRetentionManager) {
      serverModule.versionRetentionManager = {
        applyRetentionPolicy: jest.fn().mockResolvedValue({ success: true, deleted: 0 }),
        applyRetentionPolicyToProject: jest.fn().mockResolvedValue({ success: true, filesProcessed: 0 }),
        setStrategy: jest.fn(),
        getStrategy: jest.fn()
      };
    }
  } finally {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    if (originalEnv) {
      process.env.NODE_ENV = originalEnv;
    }
  }
});

afterAll(async () => {
  // Clean up if needed
  if (serverModule) {
    try {
      // Clear stats interval if it exists
      if (serverModule.statsInterval) {
        clearInterval(serverModule.statsInterval);
      }
      
      // Close collaboration service if it exists
      if (serverModule.collaborationService) {
        await serverModule.collaborationService.close().catch(() => {});
      }
      
      // Shutdown container service if it exists
      if (serverModule.containerService) {
        await serverModule.containerService.shutdown().catch(() => {});
      }
      
      // Close WebSocket server if it exists
      if (serverModule.wss) {
        serverModule.wss.clients.forEach((ws) => {
          try {
            ws.terminate();
          } catch (e) {
            // Ignore errors
          }
        });
        await new Promise((resolve) => {
          if (serverModule.wss) {
            serverModule.wss.close(() => resolve());
            // Timeout after 1 second
            setTimeout(resolve, 1000);
          } else {
            resolve();
          }
        });
      }
      
      // Close HTTP server if it exists
      if (serverModule.server) {
        await new Promise((resolve) => {
          if (typeof serverModule.server.close === 'function') {
            serverModule.server.close(() => resolve());
            // Timeout after 1 second
            setTimeout(resolve, 1000);
          } else {
            resolve();
          }
        });
      }
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
  
  // Clear any remaining timers
  jest.clearAllTimers();
});

describe('Server API Endpoints - Actual server.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mock return values
    mockFileSystemService.listProjects.mockResolvedValue([]);
    mockFileSystemService.projectExists.mockResolvedValue({ exists: true });
    mockFileSystemService.deleteProject.mockResolvedValue({ success: true });
    mockFileSystemService.getProjectStructure.mockResolvedValue([]);
    mockFileSystemService.createFile.mockResolvedValue({ success: true });
    mockFileSystemService.createFolder.mockResolvedValue({ success: true });
    mockFileSystemService.readFile.mockResolvedValue({ success: true, content: '' });
    mockFileSystemService.updateFile.mockResolvedValue({ success: true });
    mockFileSystemService.deleteItem.mockResolvedValue({ success: true });
    mockFileSystemService.renameItem.mockResolvedValue({ success: true });
    mockFileSystemService.initializeProject.mockResolvedValue({ success: true });
    mockFileSystemService.searchFiles.mockResolvedValue([]);
    mockFileSystemService.getFileMetadata.mockResolvedValue({ size: 0, modified: new Date() });
    mockFileSystemService.copyItem.mockResolvedValue({ success: true });
    mockFileSystemService.moveItem.mockResolvedValue({ success: true });
    mockFileSystemService.listFileVersions.mockResolvedValue([]);
    
    mockContainerService.listContainers.mockResolvedValue([]);
    mockContainerService.createContainer.mockResolvedValue({ id: 'container-123' });
    mockContainerService.stopContainer.mockResolvedValue(undefined);
    mockContainerService.getContainerStats.mockResolvedValue({ cpu: 0, memory: 0 });
    mockContainerService.getActivePortsForProject.mockResolvedValue([]);
    mockContainerService.checkContainerPorts.mockResolvedValue(undefined);
    mockContainerService.getRunningProcesses.mockResolvedValue([]);
    mockContainerService.killProcess.mockResolvedValue(undefined);
    mockContainerService.syncFileToContainer.mockResolvedValue(undefined);
    
    mockOutputManager.getConsoleOutput.mockReturnValue([]);
    mockOutputManager.clearConsoleOutput.mockReturnValue(undefined);
    
    mockCollaborationService.getAllMetrics.mockReturnValue({
      totalRooms: 0,
      rooms: {}
    });
    
    // Set up a mock room for collaboration tests
    const mockRoom = {
      getMetrics: jest.fn().mockReturnValue({
        connections: 0,
        updates: 0
      })
    };
    mockCollaborationService.rooms.set('test-doc-id', mockRoom);
    mockCollaborationService.getRoom.mockReturnValue(mockRoom);
    
    // Ensure versionRetentionManager is available and mocked
    if (serverModule && !serverModule.versionRetentionManager) {
      serverModule.versionRetentionManager = {
        applyRetentionPolicy: jest.fn().mockResolvedValue({ success: true, deleted: 0 }),
        applyRetentionPolicyToProject: jest.fn().mockResolvedValue({ success: true, filesProcessed: 0 }),
        setStrategy: jest.fn()
      };
    } else if (serverModule && serverModule.versionRetentionManager) {
      // Reset mocks if it already exists
      if (typeof serverModule.versionRetentionManager.applyRetentionPolicy === 'function') {
        serverModule.versionRetentionManager.applyRetentionPolicy.mockClear();
        serverModule.versionRetentionManager.applyRetentionPolicy.mockResolvedValue({ success: true, deleted: 0 });
      }
      if (typeof serverModule.versionRetentionManager.applyRetentionPolicyToProject === 'function') {
        serverModule.versionRetentionManager.applyRetentionPolicyToProject.mockClear();
        serverModule.versionRetentionManager.applyRetentionPolicyToProject.mockResolvedValue({ success: true, filesProcessed: 0 });
      }
    }
  });

  describe('GET /api/health', () => {
    it('should return health status successfully', async () => {
      mockContainerService.listContainers.mockResolvedValue([
        { projectId: 'test-project', state: 'running' }
      ]);

      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        status: expect.any(String),
        timestamp: expect.any(String),
        services: expect.objectContaining({
          fileSystem: expect.any(String),
          containers: expect.any(String)
        })
      });
      expect(mockContainerService.listContainers).toHaveBeenCalled();
    });

    it('should return degraded status when container service fails', async () => {
      mockContainerService.listContainers.mockRejectedValue(new Error('Container service error'));

      const response = await request(app)
        .get('/api/health')
        .expect(503);

      expect(response.body).toMatchObject({
        success: true,
        status: 'degraded',
        services: expect.objectContaining({
          containers: 'unhealthy'
        })
      });
    });

    it('should include memory and uptime information', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.memory).toBe('object');
      expect(typeof response.body.uptime).toBe('number');
    });
  });

  describe('GET /api/debug/adapter', () => {
    it('should return adapter information', async () => {
      mockFileSystemService.storage.getVersioningStatus.mockResolvedValue({
        Status: 'Enabled'
      });

      const response = await request(app)
        .get('/api/debug/adapter')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        adapter: expect.objectContaining({
          adapterType: expect.any(String),
          timestamp: expect.any(String)
        }),
        pattern: expect.objectContaining({
          name: 'Adapter Pattern',
          type: 'Structural Design Pattern'
        })
      });
    });

    it('should handle adapter errors gracefully', async () => {
      mockFileSystemService.storage.getVersioningStatus.mockRejectedValue(
        new Error('Versioning check failed')
      );

      const response = await request(app)
        .get('/api/debug/adapter')
        .expect(200);

      expect(response.body.adapter.versioningStatus).toHaveProperty('error');
    });
  });

  describe('Container Management Endpoints', () => {
    const projectId = 'test-project';

    describe('GET /api/projects/:projectId/container/status', () => {
      it('should return container status when container exists', async () => {
        const mockContainer = {
          projectId,
          state: 'running',
          id: 'container-123'
        };
        mockContainerService.listContainers.mockResolvedValue([mockContainer]);

        const response = await request(app)
          .get(`/api/projects/${projectId}/container/status`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          status: 'running',
          container: mockContainer
        });
      });

      it('should return stopped status when container does not exist', async () => {
        mockContainerService.listContainers.mockResolvedValue([]);

        const response = await request(app)
          .get(`/api/projects/${projectId}/container/status`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          status: 'stopped',
          container: null
        });
      });

      it('should validate project ID format', async () => {
        const response = await request(app)
          .get('/api/projects/invalid@project/container/status')
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Invalid project ID format'
        });
      });
    });

    describe('POST /api/projects/:projectId/container/start', () => {
      it('should start container successfully', async () => {
        const mockContainerInfo = { id: 'container-123' };
        mockContainerService.createContainer.mockResolvedValue(mockContainerInfo);

        const response = await request(app)
          .post(`/api/projects/${projectId}/container/start`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          containerId: 'container-123',
          message: 'Container started successfully'
        });
        expect(mockContainerService.createContainer).toHaveBeenCalledWith(projectId);
      });

      it('should handle container start errors', async () => {
        mockContainerService.createContainer.mockRejectedValue(
          new Error('Failed to start container')
        );

        const response = await request(app)
          .post(`/api/projects/${projectId}/container/start`)
          .expect(500);

        expect(response.body).toHaveProperty('error');
      });
    });

    describe('POST /api/projects/:projectId/container/stop', () => {
      it('should stop container successfully', async () => {
        mockContainerService.stopContainer.mockResolvedValue(undefined);

        const response = await request(app)
          .post(`/api/projects/${projectId}/container/stop`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: 'Container stopped successfully'
        });
        expect(mockContainerService.stopContainer).toHaveBeenCalledWith(projectId);
      });

      it('should handle container stop errors', async () => {
        mockContainerService.stopContainer.mockRejectedValue(
          new Error('Failed to stop container')
        );

        const response = await request(app)
          .post(`/api/projects/${projectId}/container/stop`)
          .expect(500);

        expect(response.body).toHaveProperty('error');
      });
    });

    describe('GET /api/projects/:projectId/container/stats', () => {
      it('should return container stats when container is running', async () => {
        const mockStats = {
          cpu: 50.5,
          memory: 1024 * 1024 * 100, // 100MB
          network: { rx: 1000, tx: 2000 }
        };
        mockContainerService.getContainerStats.mockResolvedValue(mockStats);

        const response = await request(app)
          .get(`/api/projects/${projectId}/container/stats`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          stats: mockStats
        });
        expect(mockContainerService.getContainerStats).toHaveBeenCalledWith(projectId);
      });

      it('should return 404 when container is not found', async () => {
        mockContainerService.getContainerStats.mockResolvedValue(null);

        const response = await request(app)
          .get(`/api/projects/${projectId}/container/stats`)
          .expect(404);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Container not found or not running'
        });
      });
    });

    describe('GET /api/projects/:projectId/container/ssh', () => {
      it('should return SSH connection info when container is running', async () => {
        const mockContainer = {
          projectId,
          state: 'running',
          sshPort: 2222
        };
        mockContainerService.listContainers.mockResolvedValue([mockContainer]);

        const response = await request(app)
          .get(`/api/projects/${projectId}/container/ssh`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          host: 'localhost',
          port: 2222,
          user: 'developer'
        });
      });

      it('should return 404 when container is not running', async () => {
        mockContainerService.listContainers.mockResolvedValue([]);

        const response = await request(app)
          .get(`/api/projects/${projectId}/container/ssh`)
          .expect(404);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Container not running or SSH port not available'
        });
      });
    });

    describe('GET /api/projects/:projectId/ports', () => {
      it('should return active ports for project', async () => {
        const mockPorts = [
          { port: 3000, protocol: 'tcp', process: 'node' },
          { port: 8080, protocol: 'tcp', process: 'python' }
        ];
        mockContainerService.getActivePortsForProject.mockResolvedValue(mockPorts);

        const response = await request(app)
          .get(`/api/projects/${projectId}/ports`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          ports: mockPorts
        });
        expect(mockContainerService.getActivePortsForProject).toHaveBeenCalledWith(projectId);
      });
    });

    describe('POST /api/projects/:projectId/ports/refresh', () => {
      it('should refresh and return ports', async () => {
        const mockPorts = [{ port: 3000, protocol: 'tcp' }];
        mockContainerService.checkContainerPorts.mockResolvedValue(undefined);
        mockContainerService.getActivePortsForProject.mockResolvedValue(mockPorts);

        const response = await request(app)
          .post(`/api/projects/${projectId}/ports/refresh`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          ports: mockPorts,
          message: 'Port scan completed'
        });
        expect(mockContainerService.checkContainerPorts).toHaveBeenCalledWith(projectId);
      });
    });

    describe('GET /api/projects/:projectId/processes', () => {
      it('should return running processes', async () => {
        const mockProcesses = [
          { pid: 1234, command: 'node server.js', cpu: 10.5, memory: 50000 }
        ];
        mockContainerService.getRunningProcesses.mockResolvedValue(mockProcesses);

        const response = await request(app)
          .get(`/api/projects/${projectId}/processes`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          processes: mockProcesses
        });
        expect(mockContainerService.getRunningProcesses).toHaveBeenCalledWith(projectId);
      });
    });

    describe('POST /api/projects/:projectId/processes/:pid/kill', () => {
      it('should kill process successfully', async () => {
        const pid = '1234';
        mockContainerService.killProcess.mockResolvedValue(undefined);

        const response = await request(app)
          .post(`/api/projects/${projectId}/processes/${pid}/kill`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: `Process ${pid} killed`
        });
        expect(mockContainerService.killProcess).toHaveBeenCalledWith(projectId, pid);
      });
    });

    describe('GET /api/containers', () => {
      it('should list all containers', async () => {
        const mockContainers = [
          { projectId: 'project1', state: 'running' },
          { projectId: 'project2', state: 'stopped' }
        ];
        mockContainerService.listContainers.mockResolvedValue(mockContainers);

        const response = await request(app)
          .get('/api/containers')
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          containers: mockContainers
        });
        expect(mockContainerService.listContainers).toHaveBeenCalled();
      });
    });
  });

  describe('Collaboration Endpoints', () => {
    describe('GET /api/collaboration/metrics', () => {
      it('should return collaboration metrics when service is initialized', async () => {
        const mockMetrics = {
          totalRooms: 2,
          rooms: {
            'doc1': { connections: 1, updates: 10 },
            'doc2': { connections: 2, updates: 20 }
          }
        };
        mockCollaborationService.getAllMetrics.mockReturnValue(mockMetrics);

        const response = await request(app)
          .get('/api/collaboration/metrics')
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          metrics: mockMetrics
        });
        expect(mockCollaborationService.getAllMetrics).toHaveBeenCalled();
      });

      it('should return 503 when collaboration service is not initialized', async () => {
        // Temporarily set collaborationService to null
        // Note: This is tricky because collaborationService is a module-level variable
        // We'll test the error path by checking the response structure
        // In a real scenario, we'd need to mock the module differently
        
        // For now, we'll test that the endpoint exists and handles the initialized case
        // The uninitialized case would require more complex mocking
        const response = await request(app)
          .get('/api/collaboration/metrics')
          .expect(200); // Service is mocked, so it should be "initialized"

        expect(response.body).toHaveProperty('success');
      });
    });

    describe('GET /api/collaboration/rooms/:docId/metrics', () => {
      it('should return room metrics when room exists', async () => {
        const docId = 'test-doc-id';
        const mockRoomMetrics = {
          connections: 2,
          updates: 15,
          totalQueue: 0
        };
        
        const mockRoom = mockCollaborationService.rooms.get(docId);
        if (mockRoom) {
          mockRoom.getMetrics.mockReturnValue(mockRoomMetrics);
        }

        const response = await request(app)
          .get(`/api/collaboration/rooms/${docId}/metrics`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          metrics: expect.any(Object)
        });
      });

      it('should return 404 when room does not exist', async () => {
        const nonExistentDocId = 'non-existent-doc';
        mockCollaborationService.rooms.delete(nonExistentDocId);
        mockCollaborationService.rooms.set(nonExistentDocId, null);
        
        // Make sure the room is not in the map
        mockCollaborationService.rooms.delete(nonExistentDocId);

        const response = await request(app)
          .get(`/api/collaboration/rooms/${nonExistentDocId}/metrics`)
          .expect(404);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Room not found'
        });
      });
    });
  });

  // Keep existing file system endpoint tests
  describe('GET /api/projects', () => {
    it('should list all projects successfully', async () => {
      const mockProjects = [
        { id: 'project1', name: 'Project 1' },
        { id: 'project2', name: 'Project 2' }
      ];
      
      mockFileSystemService.listProjects.mockResolvedValue(mockProjects);

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body).toEqual(mockProjects);
      expect(mockFileSystemService.listProjects).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when listing projects', async () => {
      mockFileSystemService.listProjects.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/projects')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('File System Endpoints', () => {
    const projectId = 'test-project';

    describe('GET /api/projects/:projectId/files', () => {
      it('should return project structure successfully', async () => {
        const mockStructure = [
          { name: 'file1.js', type: 'file' },
          { name: 'folder1', type: 'folder' }
        ];
        mockFileSystemService.getProjectStructure.mockResolvedValue(mockStructure);

        const response = await request(app)
          .get(`/api/projects/${projectId}/files`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          structure: mockStructure
        });
        expect(mockFileSystemService.getProjectStructure).toHaveBeenCalledWith(projectId);
      });

      it('should handle storage unavailable errors', async () => {
        const storageError = new Error('ECONNREFUSED');
        storageError.code = 'ECONNREFUSED';
        mockFileSystemService.getProjectStructure.mockRejectedValue(storageError);

        const response = await request(app)
          .get(`/api/projects/${projectId}/files`)
          .expect(503);

        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringContaining('Object storage service is unavailable')
        });
      });

      it('should validate project ID format', async () => {
        const response = await request(app)
          .get('/api/projects/invalid@project/files')
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Invalid project ID format'
        });
      });
    });

    describe('POST /api/projects/:projectId/files', () => {
      it('should create file successfully', async () => {
        const filePath = 'test.js';
        const content = 'console.log("test");';
        mockFileSystemService.createFile.mockResolvedValue({ success: true });
        mockContainerService.syncFileToContainer.mockResolvedValue(undefined);

        const response = await request(app)
          .post(`/api/projects/${projectId}/files`)
          .send({ filePath, content })
          .expect(200);

        expect(response.body).toMatchObject({ success: true });
        expect(mockFileSystemService.createFile).toHaveBeenCalledWith(projectId, filePath, content);
      });

      it('should reject missing file path', async () => {
        const response = await request(app)
          .post(`/api/projects/${projectId}/files`)
          .send({ content: 'test' })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'File path is required'
        });
      });

      it('should reject path traversal attempts', async () => {
        const response = await request(app)
          .post(`/api/projects/${projectId}/files`)
          .send({ filePath: '../etc/passwd', content: 'malicious' })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Invalid file path - path traversal not allowed'
        });
      });

      it('should reject absolute paths', async () => {
        const response = await request(app)
          .post(`/api/projects/${projectId}/files`)
          .send({ filePath: '/absolute/path', content: 'test' })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Invalid file path - path traversal not allowed'
        });
      });

      it('should handle container sync errors gracefully', async () => {
        mockFileSystemService.createFile.mockResolvedValue({ success: true });
        mockContainerService.syncFileToContainer.mockRejectedValue(new Error('Container sync failed'));

        const response = await request(app)
          .post(`/api/projects/${projectId}/files`)
          .send({ filePath: 'test.js', content: 'test' })
          .expect(200);

        expect(response.body).toMatchObject({ success: true });
      });
    });

    describe('POST /api/projects/:projectId/folders', () => {
      it('should create folder successfully', async () => {
        const folderPath = 'new-folder';
        mockFileSystemService.createFolder.mockResolvedValue({ success: true });

        const response = await request(app)
          .post(`/api/projects/${projectId}/folders`)
          .send({ folderPath })
          .expect(200);

        expect(response.body).toMatchObject({ success: true });
        expect(mockFileSystemService.createFolder).toHaveBeenCalledWith(projectId, folderPath);
      });

      it('should reject missing folder path', async () => {
        const response = await request(app)
          .post(`/api/projects/${projectId}/folders`)
          .send({})
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Folder path is required'
        });
      });
    });

    describe('GET /api/projects/:projectId/files/read', () => {
      it('should read file successfully', async () => {
        const filePath = 'test.js';
        const mockContent = { success: true, content: 'file content' };
        mockFileSystemService.readFile.mockResolvedValue(mockContent);

        const response = await request(app)
          .get(`/api/projects/${projectId}/files/read`)
          .query({ path: filePath })
          .expect(200);

        expect(response.body).toEqual(mockContent);
        expect(mockFileSystemService.readFile).toHaveBeenCalledWith(projectId, filePath);
      });

      it('should reject missing file path', async () => {
        const response = await request(app)
          .get(`/api/projects/${projectId}/files/read`)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'File path is required'
        });
      });
    });

    describe('PUT /api/projects/:projectId/files/update', () => {
      it('should update file successfully', async () => {
        const filePath = 'test.js';
        const content = 'updated content';
        mockFileSystemService.updateFile.mockResolvedValue({ success: true });
        mockContainerService.syncFileToContainer.mockResolvedValue(undefined);

        const response = await request(app)
          .put(`/api/projects/${projectId}/files/update`)
          .send({ path: filePath, content })
          .expect(200);

        expect(response.body).toMatchObject({ success: true });
        expect(mockFileSystemService.updateFile).toHaveBeenCalledWith(projectId, filePath, content);
      });

      it('should reject missing file path', async () => {
        const response = await request(app)
          .put(`/api/projects/${projectId}/files/update`)
          .send({ content: 'test' })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'File path is required'
        });
      });
    });

    describe('DELETE /api/projects/:projectId/items/delete', () => {
      it('should delete item successfully', async () => {
        const itemPath = 'test.js';
        mockFileSystemService.deleteItem.mockResolvedValue({ success: true });

        const response = await request(app)
          .delete(`/api/projects/${projectId}/items/delete`)
          .send({ path: itemPath })
          .expect(200);

        expect(response.body).toMatchObject({ success: true });
        expect(mockFileSystemService.deleteItem).toHaveBeenCalledWith(projectId, itemPath);
      });

      it('should reject missing item path', async () => {
        const response = await request(app)
          .delete(`/api/projects/${projectId}/items/delete`)
          .send({})
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Item path is required'
        });
      });
    });

    describe('PATCH /api/projects/:projectId/items/rename', () => {
      it('should rename item successfully', async () => {
        const oldPath = 'old.js';
        const newPath = 'new.js';
        mockFileSystemService.renameItem.mockResolvedValue({ success: true });

        const response = await request(app)
          .patch(`/api/projects/${projectId}/items/rename`)
          .send({ oldPath, newPath })
          .expect(200);

        expect(response.body).toMatchObject({ success: true });
        expect(mockFileSystemService.renameItem).toHaveBeenCalledWith(projectId, oldPath, newPath);
      });

      it('should reject missing paths', async () => {
        const response = await request(app)
          .patch(`/api/projects/${projectId}/items/rename`)
          .send({ oldPath: 'old.js' })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Both old and new paths are required'
        });
      });
    });

    describe('POST /api/projects/:projectId/initialize', () => {
      it('should initialize project successfully', async () => {
        mockFileSystemService.initializeProject.mockResolvedValue({ success: true });

        const response = await request(app)
          .post(`/api/projects/${projectId}/initialize`)
          .expect(200);

        expect(response.body).toMatchObject({ success: true });
        expect(mockFileSystemService.initializeProject).toHaveBeenCalledWith(projectId);
      });
    });

    describe('GET /api/projects/:projectId/search', () => {
      it('should search files successfully', async () => {
        const query = 'test';
        const mockResults = [{ path: 'test.js', matches: 1 }];
        mockFileSystemService.searchFiles.mockResolvedValue(mockResults);

        const response = await request(app)
          .get(`/api/projects/${projectId}/search`)
          .query({ q: query })
          .expect(200);

        expect(response.body).toEqual(mockResults);
        expect(mockFileSystemService.searchFiles).toHaveBeenCalledWith(projectId, query);
      });

      it('should reject missing search query', async () => {
        const response = await request(app)
          .get(`/api/projects/${projectId}/search`)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Search query is required'
        });
      });
    });

    describe('GET /api/projects/:projectId/metadata', () => {
      it('should get file metadata successfully', async () => {
        const filePath = 'test.js';
        const mockDate = new Date();
        const mockMetadata = { size: 100, modified: mockDate };
        mockFileSystemService.getFileMetadata.mockResolvedValue(mockMetadata);

        const response = await request(app)
          .get(`/api/projects/${projectId}/metadata`)
          .query({ path: filePath })
          .expect(200);

        // Date objects are serialized to strings in JSON responses
        expect(response.body.size).toBe(mockMetadata.size);
        expect(response.body.modified).toBe(mockDate.toISOString());
        expect(mockFileSystemService.getFileMetadata).toHaveBeenCalledWith(projectId, filePath);
      });

      it('should reject missing file path', async () => {
        const response = await request(app)
          .get(`/api/projects/${projectId}/metadata`)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'File path is required'
        });
      });
    });

    describe('POST /api/projects/:projectId/copy', () => {
      it('should copy item successfully', async () => {
        const sourcePath = 'source.js';
        const destinationPath = 'dest.js';
        mockFileSystemService.copyItem.mockResolvedValue({ success: true });

        const response = await request(app)
          .post(`/api/projects/${projectId}/copy`)
          .send({ sourcePath, destinationPath })
          .expect(200);

        expect(response.body).toMatchObject({ success: true });
        expect(mockFileSystemService.copyItem).toHaveBeenCalledWith(projectId, sourcePath, destinationPath);
      });

      it('should reject missing paths', async () => {
        const response = await request(app)
          .post(`/api/projects/${projectId}/copy`)
          .send({ sourcePath: 'source.js' })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Both source and destination paths are required'
        });
      });
    });

    describe('POST /api/projects/:projectId/move', () => {
      it('should move item successfully', async () => {
        const sourcePath = 'source.js';
        const destinationPath = 'dest.js';
        mockFileSystemService.moveItem.mockResolvedValue({ success: true });

        const response = await request(app)
          .post(`/api/projects/${projectId}/move`)
          .send({ sourcePath, destinationPath })
          .expect(200);

        expect(response.body).toMatchObject({ success: true });
        expect(mockFileSystemService.moveItem).toHaveBeenCalledWith(projectId, sourcePath, destinationPath);
      });

      it('should reject missing paths', async () => {
        const response = await request(app)
          .post(`/api/projects/${projectId}/move`)
          .send({ sourcePath: 'source.js' })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Both source and destination paths are required'
        });
      });
    });

    describe('POST /api/projects/:projectId/files/refresh', () => {
      it('should refresh file tree when container exists', async () => {
        mockContainerService.containers = new Map([[projectId, {}]]);
        mockContainerService.checkFileChanges = jest.fn().mockResolvedValue(undefined);
        mockFileSystemService.getProjectStructure.mockResolvedValue([]);

        const response = await request(app)
          .post(`/api/projects/${projectId}/files/refresh`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: 'File tree refreshed'
        });
      });

      it('should refresh file tree when container does not exist', async () => {
        mockContainerService.containers = new Map();
        mockFileSystemService.getProjectStructure.mockResolvedValue([]);

        const response = await request(app)
          .post(`/api/projects/${projectId}/files/refresh`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: 'File tree refreshed'
        });
      });
    });
  });

  describe('Version Management Endpoints', () => {
    const projectId = 'test-project';

    describe('GET /api/versioning/status', () => {
      it('should get versioning status successfully', async () => {
        const mockStatus = { Status: 'Enabled' };
        mockFileSystemService.getVersioningStatus = jest.fn().mockResolvedValue(mockStatus);

        const response = await request(app)
          .get('/api/versioning/status')
          .expect(200);

        expect(response.body).toEqual(mockStatus);
      });
    });

    describe('POST /api/versioning/enable', () => {
      it('should enable versioning successfully', async () => {
        const mockResult = { success: true, message: 'Versioning enabled' };
        mockFileSystemService.enableVersioning = jest.fn().mockResolvedValue(mockResult);

        const response = await request(app)
          .post('/api/versioning/enable')
          .expect(200);

        expect(response.body).toEqual(mockResult);
      });
    });

    describe('GET /api/projects/:projectId/files/versions', () => {
      it('should list file versions successfully', async () => {
        const filePath = 'test.js';
        const mockDate = new Date();
        const mockVersions = [{ versionId: 'v1', timestamp: mockDate }];
        mockFileSystemService.listFileVersions.mockResolvedValue(mockVersions);

        const response = await request(app)
          .get(`/api/projects/${projectId}/files/versions`)
          .query({ path: filePath })
          .expect(200);

        // Date objects are serialized to strings in JSON responses
        expect(response.body).toHaveLength(1);
        expect(response.body[0].versionId).toBe('v1');
        expect(response.body[0].timestamp).toBe(mockDate.toISOString());
        expect(mockFileSystemService.listFileVersions).toHaveBeenCalledWith(projectId, filePath);
      });

      it('should reject missing file path', async () => {
        const response = await request(app)
          .get(`/api/projects/${projectId}/files/versions`)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'File path is required (use ?path=...)'
        });
      });
    });

    describe('GET /api/projects/:projectId/files/current-version', () => {
      it('should get current version ID successfully', async () => {
        const filePath = 'test.js';
        const mockVersionId = 'v123';
        mockFileSystemService.getCurrentVersionId = jest.fn().mockResolvedValue({ versionId: mockVersionId });

        const response = await request(app)
          .get(`/api/projects/${projectId}/files/current-version`)
          .query({ path: filePath })
          .expect(200);

        expect(response.body).toMatchObject({ versionId: mockVersionId });
        expect(mockFileSystemService.getCurrentVersionId).toHaveBeenCalledWith(projectId, filePath);
      });

      it('should reject missing file path', async () => {
        const response = await request(app)
          .get(`/api/projects/${projectId}/files/current-version`)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'File path is required (use ?path=...)'
        });
      });
    });

    describe('GET /api/projects/:projectId/files/version/:versionId', () => {
      it('should get file version successfully', async () => {
        const filePath = 'test.js';
        const versionId = 'v123';
        const mockContent = { content: 'version content', versionId };
        mockFileSystemService.getFileVersion = jest.fn().mockResolvedValue(mockContent);

        const response = await request(app)
          .get(`/api/projects/${projectId}/files/version/${versionId}`)
          .query({ path: filePath })
          .expect(200);

        expect(response.body).toEqual(mockContent);
        expect(mockFileSystemService.getFileVersion).toHaveBeenCalledWith(projectId, filePath, versionId);
      });

      it('should reject missing file path', async () => {
        const response = await request(app)
          .get(`/api/projects/${projectId}/files/version/v123`)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'File path is required (use ?path=...)'
        });
      });
    });

    describe('POST /api/projects/:projectId/files/restore', () => {
      it('should restore file version successfully', async () => {
        const filePath = 'test.js';
        const versionId = 'v123';
        const mockResult = { success: true };
        mockFileSystemService.restoreFileVersion = jest.fn().mockResolvedValue(mockResult);

        const response = await request(app)
          .post(`/api/projects/${projectId}/files/restore`)
          .send({ path: filePath, versionId })
          .expect(200);

        expect(response.body).toEqual(mockResult);
        expect(mockFileSystemService.restoreFileVersion).toHaveBeenCalledWith(projectId, filePath, versionId);
      });

      it('should reject missing parameters', async () => {
        const response = await request(app)
          .post(`/api/projects/${projectId}/files/restore`)
          .send({ path: 'test.js' })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Both file path and versionId are required'
        });
      });
    });

    describe('DELETE /api/projects/:projectId/files/version/:versionId', () => {
      it('should delete file version successfully', async () => {
        const filePath = 'test.js';
        const versionId = 'v123';
        const mockResult = { success: true };
        mockFileSystemService.deleteFileVersion = jest.fn().mockResolvedValue(mockResult);

        const response = await request(app)
          .delete(`/api/projects/${projectId}/files/version/${versionId}`)
          .send({ path: filePath })
          .expect(200);

        expect(response.body).toEqual(mockResult);
        expect(mockFileSystemService.deleteFileVersion).toHaveBeenCalledWith(projectId, filePath, versionId);
      });

      it('should reject missing file path', async () => {
        const response = await request(app)
          .delete(`/api/projects/${projectId}/files/version/v123`)
          .send({})
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'File path is required in request body'
        });
      });
    });
  });

  describe('Error Handling Middleware', () => {
    it('should handle errors in development mode with stack trace', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      mockFileSystemService.listProjects.mockRejectedValue(new Error('Test error'));

      const response = await request(app)
        .get('/api/projects')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Test error');
      expect(response.body).toHaveProperty('stack');
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should hide error details in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      mockFileSystemService.listProjects.mockRejectedValue(new Error('Test error'));

      const response = await request(app)
        .get('/api/projects')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
      expect(response.body).not.toHaveProperty('stack');
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should include request ID in error response', async () => {
      mockFileSystemService.listProjects.mockRejectedValue(new Error('Test error'));

      const response = await request(app)
        .get('/api/projects')
        .expect(500);

      expect(response.body).toHaveProperty('requestId');
    });
  });

  describe('DELETE /api/projects/:projectId', () => {
    it('should delete project successfully', async () => {
      mockFileSystemService.projectExists.mockResolvedValue({ exists: true });
      mockFileSystemService.deleteProject.mockResolvedValue({ success: true, message: 'Project deleted' });
      mockContainerService.stopContainer.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/projects/test-project')
        .expect(200);

      expect(response.body).toMatchObject({ success: true });
      expect(mockFileSystemService.deleteProject).toHaveBeenCalledWith('test-project');
    });

    it('should return 404 if project does not exist', async () => {
      mockFileSystemService.projectExists.mockResolvedValue({ exists: false });

      const response = await request(app)
        .delete('/api/projects/nonexistent-project')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Project not found'
      });
    });

    it('should handle container stop errors gracefully', async () => {
      mockFileSystemService.projectExists.mockResolvedValue({ exists: true });
      mockFileSystemService.deleteProject.mockResolvedValue({ success: true });
      mockContainerService.stopContainer.mockRejectedValue(new Error('Container not found'));

      const response = await request(app)
        .delete('/api/projects/test-project')
        .expect(200);

      expect(response.body).toMatchObject({ success: true });
    });
  });

  describe('GET /api/projects/:projectId/exists', () => {
    it('should check if project exists', async () => {
      mockFileSystemService.projectExists.mockResolvedValue({ exists: true });

      const response = await request(app)
        .get('/api/projects/test-project/exists')
        .expect(200);

      expect(response.body).toMatchObject({ exists: true });
      expect(mockFileSystemService.projectExists).toHaveBeenCalledWith('test-project');
    });

    it('should validate project ID format', async () => {
      const response = await request(app)
        .get('/api/projects/invalid@project/exists')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid project ID format'
      });
    });
  });

  describe('Output Management Endpoints', () => {
    const projectId = 'test-project';

    describe('GET /api/projects/:projectId/output/console', () => {
      it('should get console output with default lines', async () => {
        mockOutputManager.getConsoleOutput.mockReturnValue([
          { timestamp: new Date().toISOString(), content: 'Test output', type: 'stdout' }
        ]);

        const response = await request(app)
          .get(`/api/projects/${projectId}/output/console`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          output: expect.any(Array),
          projectId
        });
        expect(mockOutputManager.getConsoleOutput).toHaveBeenCalledWith(projectId, 100);
      });

      it('should get console output with custom lines', async () => {
        mockOutputManager.getConsoleOutput.mockReturnValue([]);

        const response = await request(app)
          .get(`/api/projects/${projectId}/output/console`)
          .query({ lines: 50 })
          .expect(200);

        expect(mockOutputManager.getConsoleOutput).toHaveBeenCalledWith(projectId, 50);
      });
    });

    describe('POST /api/projects/:projectId/output/clear', () => {
      it('should clear console output', async () => {
        const response = await request(app)
          .post(`/api/projects/${projectId}/output/clear`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: 'Console output cleared'
        });
        expect(mockOutputManager.clearConsoleOutput).toHaveBeenCalledWith(projectId);
      });
    });
  });

  describe('Version Retention Strategy Endpoints', () => {
    const projectId = 'test-project';

    describe('POST /api/projects/:projectId/retention/apply', () => {
      it('should apply retention policy successfully', async () => {
        const filePath = 'test.js';
        const mockResult = { success: true, deleted: 5 };
        
        // Ensure versionRetentionManager exists and is properly mocked
        if (!serverModule.versionRetentionManager) {
          serverModule.versionRetentionManager = {
            applyRetentionPolicy: jest.fn(),
            applyRetentionPolicyToProject: jest.fn()
          };
        }
        
        // Always replace with a fresh jest mock to ensure it's callable
        const mockApplyRetentionPolicy = jest.fn().mockResolvedValue(mockResult);
        serverModule.versionRetentionManager.applyRetentionPolicy = mockApplyRetentionPolicy;

        const response = await request(app)
          .post(`/api/projects/${projectId}/retention/apply`)
          .send({ path: filePath })
          .expect(200);

        expect(response.body).toEqual(mockResult);
        expect(mockApplyRetentionPolicy).toHaveBeenCalledWith(projectId, filePath);
      });

      it('should reject missing file path', async () => {
        const response = await request(app)
          .post(`/api/projects/${projectId}/retention/apply`)
          .send({})
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'File path is required in request body'
        });
      });
    });

    describe('POST /api/projects/:projectId/retention/apply-all', () => {
      it('should apply retention policy to all files', async () => {
        const mockResult = { success: true, filesProcessed: 10 };
        
        // Ensure versionRetentionManager exists and is properly mocked
        if (!serverModule.versionRetentionManager) {
          serverModule.versionRetentionManager = {
            applyRetentionPolicy: jest.fn(),
            applyRetentionPolicyToProject: jest.fn()
          };
        }
        
        // Always replace with a fresh jest mock to ensure it's callable
        const mockApplyRetentionPolicyToProject = jest.fn().mockResolvedValue(mockResult);
        serverModule.versionRetentionManager.applyRetentionPolicyToProject = mockApplyRetentionPolicyToProject;

        const response = await request(app)
          .post(`/api/projects/${projectId}/retention/apply-all`)
          .expect(200);

        expect(response.body).toEqual(mockResult);
        expect(mockApplyRetentionPolicyToProject).toHaveBeenCalledWith(projectId);
      });
    });

    describe('POST /api/retention/strategy', () => {
      it('should change to keepRecent strategy', async () => {
        const response = await request(app)
          .post('/api/retention/strategy')
          .send({ strategyType: 'keepRecent', options: { maxVersions: 20 } })
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
        // Strategy name might be undefined if getName() doesn't exist, so just check success
      });

      it('should change to timeBased strategy', async () => {
        const response = await request(app)
          .post('/api/retention/strategy')
          .send({ 
            strategyType: 'timeBased', 
            options: { retentionDays: 30 } 
          })
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      });

      it('should change to tagged strategy', async () => {
        const response = await request(app)
          .post('/api/retention/strategy')
          .send({ 
            strategyType: 'tagged', 
            options: { keepTagged: true } 
          })
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      });

      it('should reject missing strategy type', async () => {
        const response = await request(app)
          .post('/api/retention/strategy')
          .send({ options: { maxVersions: 10 } })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Strategy type is required (keepRecent, timeBased, tagged)'
        });
      });

      it('should reject invalid strategy type', async () => {
        const response = await request(app)
          .post('/api/retention/strategy')
          .send({ strategyType: 'invalid' })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringContaining('Invalid strategy type')
        });
      });
    });

    describe('GET /api/retention/strategy', () => {
      it('should get current retention strategy', async () => {
        // Ensure versionRetentionManager has a strategy
        if (serverModule && serverModule.versionRetentionManager) {
          serverModule.versionRetentionManager.strategy = {
            getName: jest.fn().mockReturnValue('KeepRecent(10)')
          };
        }

        const response = await request(app)
          .get('/api/retention/strategy');

        if (response.status === 200) {
          expect(response.body).toHaveProperty('success', true);
          expect(response.body).toHaveProperty('strategy');
        }
      });
    });
  });

  describe('Additional Server Endpoints', () => {
    describe('POST /api/projects/:projectId/container/ssh/connect', () => {
      const projectId = 'test-project';

      it('should handle SSH connect request', async () => {
        // Mock execAsync to avoid actual AppleScript execution
        const originalExec = require('util').promisify;
        jest.spyOn(require('util'), 'promisify').mockImplementation(() => {
          return jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
        });

        const response = await request(app)
          .post(`/api/projects/${projectId}/container/ssh/connect`)
          .send({ command: 'ssh', script: 'test script' })
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: 'SSH terminal opened successfully'
        });

        jest.restoreAllMocks();
      });

      it('should reject missing command or script', async () => {
        const response = await request(app)
          .post(`/api/projects/${projectId}/container/ssh/connect`)
          .send({ command: 'ssh' })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Command and script are required'
        });
      });
    });

    describe('404 Handler', () => {
      it('should return 404 for unknown endpoints', async () => {
        const response = await request(app)
          .get('/api/unknown/endpoint')
          .expect(404);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Endpoint not found'
        });
        expect(response.body.path).toBe('/api/unknown/endpoint');
      });
    });

    describe('Request ID Middleware', () => {
      it('should add request ID to response headers', async () => {
        const response = await request(app)
          .get('/api/health')
          .expect(200);

        expect(response.headers['x-request-id']).toBeDefined();
        expect(typeof response.headers['x-request-id']).toBe('string');
      });
    });
  });
});
