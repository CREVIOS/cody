/**
 * Jest tests for ContainerService
 * Tests methods and error handling paths
 */

jest.mock('../services/fileSystemService');

// Mock Docker at module level before ContainerService is loaded
const mockStream = {
  on: jest.fn((event, callback) => {
    if (event === 'data') {
      setImmediate(() => callback(Buffer.from('{"stream":"Step 1/10"}')));
    } else if (event === 'end') {
      setImmediate(() => callback());
    }
    return mockStream;
  })
};

const mockImage = {
  inspect: jest.fn().mockResolvedValue({ Id: 'mock-image-id' })
};

const mockDockerInstance = {
  getImage: jest.fn().mockReturnValue(mockImage),
  buildImage: jest.fn().mockResolvedValue(mockStream),
  modem: {
    followProgress: jest.fn((stream, callback, onProgress) => {
      setImmediate(() => callback(null, [{ id: 'image-id' }]));
    })
  },
  listContainers: jest.fn().mockResolvedValue([]),
  getContainer: jest.fn(),
  createContainer: jest.fn()
};

jest.mock('dockerode', () => {
  return jest.fn(() => mockDockerInstance);
});

const ContainerService = require('../services/containerService');
const FileSystemService = require('../services/fileSystemService');
const Docker = require('dockerode');

describe('ContainerService', () => {
  let containerService;
  let mockFileSystemService;
  let originalConsoleError;

  // Helper to wait for init to complete
  async function waitForInit(service, timeout = 1000) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve(), timeout);
      
      service.once('ready', () => {
        clearTimeout(timeoutId);
        resolve();
      });
      
      service.once('error', () => {
        clearTimeout(timeoutId);
        // In test environment, init may fail but we still resolve
        resolve();
      });
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Suppress console.error during tests to prevent post-test logging
    originalConsoleError = console.error;
    console.error = jest.fn();
    
    // Set NODE_ENV to test to prevent throwing errors
    process.env.NODE_ENV = 'test';
    
    // Reset Docker mock functions
    mockImage.inspect.mockClear();
    mockImage.inspect.mockResolvedValue({ Id: 'mock-image-id' });
    mockDockerInstance.getImage.mockClear();
    mockDockerInstance.getImage.mockReturnValue(mockImage);
    mockDockerInstance.buildImage.mockClear();
    mockDockerInstance.buildImage.mockResolvedValue(mockStream);
    mockDockerInstance.modem.followProgress.mockClear();
    mockDockerInstance.modem.followProgress.mockImplementation((stream, callback) => {
      setImmediate(() => callback(null, [{ id: 'image-id' }]));
    });
    
    mockFileSystemService = {
      getProjectStructure: jest.fn().mockResolvedValue([]),
      readFile: jest.fn().mockResolvedValue({ success: true, content: '' }),
      updateFile: jest.fn().mockResolvedValue({ success: true }),
      createFile: jest.fn().mockResolvedValue({ success: true }),
      deleteItem: jest.fn().mockResolvedValue({ success: true })
    };

    FileSystemService.mockImplementation(() => mockFileSystemService);
    
    containerService = new ContainerService(mockFileSystemService);
  });

  afterEach(async () => {
    // Restore console.error
    if (originalConsoleError) {
      console.error = originalConsoleError;
    }
    
    if (containerService) {
      try {
        await containerService.shutdown();
      } catch (e) {
        // Ignore shutdown errors in tests
      }
    }
  });

  describe('Initialization', () => {
    it('should initialize with fileSystemService', () => {
      expect(containerService.fileSystemService).toBe(mockFileSystemService);
      expect(containerService.containers).toBeInstanceOf(Map);
      expect(containerService.sessions).toBeInstanceOf(Map);
      expect(containerService.config).toBeDefined();
    });

    it('should have default configuration', () => {
      expect(containerService.config.maxContainers).toBe(10);
      expect(containerService.config.cleanupInterval).toBe(5 * 60 * 1000);
      expect(containerService.config.portCheckInterval).toBe(2000);
    });

    it('should start cleanup timer on init', async () => {
      // Wait for init to complete (either ready or error event)
      await waitForInit(containerService);
      
      // Cleanup timer should be set even if Docker init fails in test environment
      expect(containerService.cleanupTimer).toBeDefined();
    });
  });

  describe('Cleanup Timer', () => {
    it('should store cleanup timer interval', async () => {
      // Wait for init to complete
      await waitForInit(containerService);
      expect(containerService.cleanupTimer).toBeDefined();
    });

    it('should clear cleanup timer on shutdown', async () => {
      const timerId = containerService.cleanupTimer;
      await containerService.shutdown();
      expect(containerService.cleanupTimer).toBeNull();
    });

    it('should handle multiple startCleanupTimer calls', async () => {
      // Wait for init to complete
      await waitForInit(containerService);
      
      const firstTimer = containerService.cleanupTimer;
      containerService.startCleanupTimer();
      const secondTimer = containerService.cleanupTimer;
      expect(secondTimer).toBeDefined();
      // Should be a different timer (old one cleared)
      expect(secondTimer).not.toBe(firstTimer);
    });
  });

  describe('Port Monitoring', () => {
    it('should clear port monitors on shutdown', async () => {
      // Add a mock port monitor
      const mockInterval = setInterval(() => {}, 1000);
      containerService.portMonitors.set('test-project', {
        interval: mockInterval,
        startTime: new Date()
      });

      await containerService.shutdown();
      expect(containerService.portMonitors.size).toBe(0);
    });
  });

  describe('File Watchers', () => {
    it('should clear file watchers on shutdown', async () => {
      // Initialize fileWatchers if not already
      if (!containerService.fileWatchers) {
        containerService.fileWatchers = new Map();
      }

      const mockInterval = setInterval(() => {}, 1000);
      containerService.fileWatchers.set('test-project', {
        interval: mockInterval,
        lastState: new Map(),
        startTime: new Date()
      });

      await containerService.shutdown();
      expect(containerService.fileWatchers.size).toBe(0);
    });
  });

  describe('listContainers', () => {
    it('should return empty array when no containers', async () => {
      const containers = await containerService.listContainers();
      expect(containers).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      // Mock docker.listContainers to throw
      containerService.docker = {
        listContainers: jest.fn().mockRejectedValue(new Error('Docker error'))
      };

      const containers = await containerService.listContainers();
      expect(Array.isArray(containers)).toBe(true);
    });
  });

  describe('Shutdown', () => {
    it('should clear all timers and monitors', async () => {
      // Set up some state
      containerService.containers.set('test1', {});
      containerService.containers.set('test2', {});
      
      // Mock stopContainer to avoid actual Docker calls
      containerService.stopContainer = jest.fn().mockResolvedValue(undefined);

      await containerService.shutdown();

      expect(containerService.cleanupTimer).toBeNull();
      expect(containerService.portMonitors.size).toBe(0);
      if (containerService.fileWatchers) {
        expect(containerService.fileWatchers.size).toBe(0);
      }
    });

    it('should handle shutdown errors gracefully', async () => {
      containerService.stopContainer = jest.fn().mockRejectedValue(new Error('Stop failed'));

      // Should not throw
      await expect(containerService.shutdown()).resolves.not.toThrow();
    });
  });
});

