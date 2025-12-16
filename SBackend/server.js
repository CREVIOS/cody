// Load environment variables first
require('dotenv').config();

// server.js - Enhanced Production Server
const express = require("express");
const WebSocket = require("ws");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const compression = require("compression");
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const axios = require('axios');
const crypto = require('crypto');

// Services
const FileSystemService = require("./services/fileSystemService");
const ContainerService = require("./services/containerService");
const OutputManager = require("./services/outputManager");
const { CollaborationService } = require("./services/collaborationService");
const { CollabPubSub } = require("./services/collabPubSub");
const {
  KeepRecentVersionsStrategy,
  TimeBasedRetentionStrategy,
  TaggedVersionsStrategy,
  VersionRetentionManager
} = require("./services/versionRetentionStrategies");

// Create Express app with security middleware
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

// CORS configuration
const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];
const envCorsOriginsRaw = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '';
const envCorsOrigins = envCorsOriginsRaw
  .split(',')
  .map((v) => v.trim())
  .filter((v) => v.length > 0);
const allowedCorsOrigins = [...defaultCorsOrigins, ...envCorsOrigins];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser clients or same-origin requests without an Origin header
    if (!origin) return callback(null, true);

    // Always allow localhost/127.0.0.1 in development for any port
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return callback(null, true);
      }
    } catch (_) {}

    if (allowedCorsOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In non-production, be permissive to reduce dev friction
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      return callback(null, true);
    }

    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
app.use(morgan('combined'));

// Request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  res.set('X-Request-ID', req.id);
  next();
});

// Initialize services with error handling
let fileSystemService;
let containerService;
let outputManager;
let collaborationService;
let versionRetentionManager;

async function initializeServices() {
  try {
    console.log('🚀 Initializing services...');

    fileSystemService = new FileSystemService();
    outputManager = new OutputManager();
    containerService = new ContainerService(fileSystemService);
    collaborationService = new CollaborationService('./data/collaboration', {
      snapshotInterval: 5 * 60 * 1000, // 5 minutes
      maxUpdatesBeforeSnapshot: 100,
      gcEnabled: true,
      roomCleanupInterval: 60 * 1000, // 1 minute
      roomIdleTimeout: 5 * 60 * 1000, // 5 minutes
      pubSubBridge: collabPubSub
    });

    // Initialize version retention manager with default strategy
    const defaultStrategy = new KeepRecentVersionsStrategy(10); // Keep 10 most recent versions by default
    versionRetentionManager = new VersionRetentionManager(fileSystemService, defaultStrategy);
    console.log('✅ Version retention manager initialized with KeepRecentVersionsStrategy(10)');

    // Connect output manager to container service
    containerService.outputManager = outputManager;
    
    // Wait for container service to initialize (no fallback resolve)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Container service initialization timeout'));
      }, 600000); // 10 minute timeout to allow image build

      containerService.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    
    // Set up event handlers after services are initialized
    setupEventHandlers();

    // Bring cross-instance pub/sub online once core services are ready
    await crossInstancePubSub.init().catch(err => {
      console.error('❌ Failed to initialize cross-instance pub/sub:', err);
    });
    await collabPubSub.init().catch(err => {
      console.error('❌ Failed to initialize collaboration pub/sub:', err);
    });
    
    console.log('✅ Services initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    process.exit(1);
  }
}

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const validateProjectId = (req, res, next) => {
  const { projectId } = req.params;
  if (!projectId || !/^[a-zA-Z0-9\-_]+$/.test(projectId)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid project ID format' 
    });
  }
  next();
};

const STORAGE_UNAVAILABLE_MESSAGE = 'Object storage service is unavailable. Please ensure MinIO is running (default endpoint http://localhost:9000).';

const isStorageUnavailableError = (error) => {
  if (!error) {
    return false;
  }

  if (error.code === 'ECONNREFUSED') {
    return true;
  }

  if (error.errors && Array.isArray(error.errors)) {
    if (error.errors.some((inner) => inner && inner.code === 'ECONNREFUSED')) {
      return true;
    }
  }

  const message = typeof error.message === 'string' ? error.message : '';
  if (message.includes('ECONNREFUSED') || message.includes('getaddrinfo ENOTFOUND')) {
    return true;
  }

  return false;
};

// Instance/runtime level configuration
const INSTANCE_ID = process.env.INSTANCE_ID || uuidv4();
const WS_JWT_SECRET = process.env.WS_JWT_SECRET || process.env.JWT_SECRET;
const WS_JWT_PUBLIC_KEY = process.env.WS_JWT_PUBLIC_KEY || process.env.JWT_PUBLIC_KEY;
const WS_ALLOW_ANONYMOUS = process.env.WS_ALLOW_ANONYMOUS === 'true';
const FILE_PERSIST_DEBOUNCE_MS = parseInt(process.env.FILE_PERSIST_DEBOUNCE_MS || '150', 10);

// In-memory caches for streaming file changes (kept small; persisted to MinIO asynchronously)
const fileStateCache = new Map(); // key => { version, content }
const filePersistTimers = new Map(); // key => timeout handle
const fileOperationQueues = new Map(); // key => promise chain

// Health check with detailed status
app.get('/api/health', asyncHandler(async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      fileSystem: 'healthy',
      containers: 'healthy',
      collaboration: collaborationService ? 'healthy' : 'not initialized'
    }
  };

  try {
    // Check container service
    const containers = await containerService.listContainers();
    health.services.containers = 'healthy';
    health.containerCount = containers.length;
  } catch (error) {
    health.services.containers = 'unhealthy';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json({ success: true, ...health });
}));

// Project Management API Routes
app.get('/api/projects', asyncHandler(async (req, res) => {
  const result = await fileSystemService.listProjects();
  res.json(result);
}));

// ==================== PROJECT-SPECIFIC API ROUTES (Proxy to FastAPI Backend) ====================
// These routes proxy to the FastAPI backend (port 8000) for project-specific data
const FASTAPI_BACKEND_URL = process.env.FASTAPI_BACKEND_URL || 'http://localhost:8000';

// Helper function to proxy requests to FastAPI backend
const proxyToFastAPI = async (req, res, endpoint) => {
  try {
    // Build query string from request query parameters
    const queryParams = new URLSearchParams();
    Object.keys(req.query).forEach(key => {
      if (req.query[key] !== undefined && req.query[key] !== null) {
        queryParams.append(key, req.query[key]);
      }
    });
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const fullUrl = `${FASTAPI_BACKEND_URL}${endpoint}${queryString}`;
    
    const axiosConfig = {
      method: req.method.toLowerCase(),
      url: fullUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
      },
      validateStatus: () => true, // Don't throw on any status code
    };
    
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
      axiosConfig.data = req.body;
    }
    
    const response = await axios(axiosConfig);
    
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error(`Error proxying to FastAPI backend (${endpoint}):`, error);
    const errorMessage = error.response?.data?.detail || error.message || 'Backend service unavailable';
    res.status(error.response?.status || 503).json({
      success: false,
      error: 'Backend service unavailable',
      message: errorMessage
    });
  }
};

// GET /projects/:projectId/roles - Get all available roles (not project-specific, but included for convenience)
app.get('/projects/:projectId/roles', validateProjectId, asyncHandler(async (req, res) => {
  // Proxy to the general roles endpoint since roles are not project-specific
  await proxyToFastAPI(req, res, `/api/v1/roles`);
}));

// GET /projects/:projectId/permissions - Get permissions for a user in a project
app.get('/projects/:projectId/permissions', validateProjectId, asyncHandler(async (req, res) => {
  // This endpoint requires user_id query parameter - proxy will handle query params
  await proxyToFastAPI(req, res, `/api/v1/permissions/projects/${req.params.projectId}`);
}));

// GET /projects/:projectId/members - Get members for a project
app.get('/projects/:projectId/members', validateProjectId, asyncHandler(async (req, res) => {
  await proxyToFastAPI(req, res, `/api/v1/project-members/by-project/${req.params.projectId}`);
}));

// GET /projects/:projectId/invitations - Get invitations for a project
app.get('/projects/:projectId/invitations', validateProjectId, asyncHandler(async (req, res) => {
  // Add project_id to query params and proxy will forward all query params
  req.query.project_id = req.params.projectId;
  await proxyToFastAPI(req, res, `/api/v1/project-invitations`);
}));

app.delete('/api/projects/:projectId', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  
  // Stop any running containers first
  try {
    await containerService.stopContainer(projectId);
  } catch (error) {
    console.warn(`No container to stop for project ${projectId}`);
  }
  
  // Check if project exists
  const exists = await fileSystemService.projectExists(projectId);
  if (!exists.exists) {
    return res.status(404).json({ 
      success: false, 
      error: 'Project not found' 
    });
  }

  const result = await fileSystemService.deleteProject(projectId);
  res.json(result);
}));

app.get('/api/projects/:projectId/exists', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const result = await fileSystemService.projectExists(projectId);
  res.json(result);
}));

// File System API Routes
app.get('/api/projects/:projectId/files', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  try {
    const structure = await fileSystemService.getProjectStructure(projectId);
    return res.json({ success: true, structure });
  } catch (error) {
    if (isStorageUnavailableError(error)) {
      console.error('❌ Object storage unavailable while loading file tree:', error);
      return res.status(503).json({
        success: false,
        error: STORAGE_UNAVAILABLE_MESSAGE
      });
    }

    throw error;
  }
}));

// Add file refresh endpoint
app.post('/api/projects/:projectId/files/refresh', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  
  // Force a file check if container is running
  if (containerService.containers.has(projectId)) {
    await containerService.checkFileChanges(projectId, new Map());
  }
  
  // Get updated structure
  const structure = await fileSystemService.getProjectStructure(projectId);
  res.json({ 
    success: true, 
    structure,
    message: 'File tree refreshed'
  });
}));

app.post('/api/projects/:projectId/files', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { filePath, content = '' } = req.body;
  
  if (!filePath) {
    return res.status(400).json({ 
      success: false, 
      error: 'File path is required' 
    });
  }

  // Enhanced path validation
  if (filePath.includes('..') || filePath.startsWith('/') || filePath.includes('\0')) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid file path - path traversal not allowed' 
    });
  }

  const result = await fileSystemService.createFile(projectId, filePath, content);
  
  // Sync to container if it exists
  try {
    await containerService.syncFileToContainer(projectId, filePath, content);
  } catch (error) {
    console.warn(`Could not sync file to container: ${error.message}`);
  }
  
  res.json(result);
}));

app.post('/api/projects/:projectId/folders', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { folderPath } = req.body;
  
  if (!folderPath) {
    return res.status(400).json({ 
      success: false, 
      error: 'Folder path is required' 
    });
  }

  const result = await fileSystemService.createFolder(projectId, folderPath);
  res.json(result);
}));

app.get('/api/projects/:projectId/files/read', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { path: filePath } = req.query;
  
  if (!filePath) {
    return res.status(400).json({ 
      success: false, 
      error: 'File path is required' 
    });
  }

  const result = await fileSystemService.readFile(projectId, filePath);
  res.json(result);
}));

app.put('/api/projects/:projectId/files/update', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { path: filePath, content } = req.body;
  
  if (!filePath) {
    return res.status(400).json({ 
      success: false, 
      error: 'File path is required' 
    });
  }

  const result = await fileSystemService.updateFile(projectId, filePath, content);
  
  // Sync to container if it exists
  try {
    await containerService.syncFileToContainer(projectId, filePath, content);
  } catch (error) {
    console.warn(`Could not sync file to container: ${error.message}`);
  }
  
  res.json(result);
}));

app.delete('/api/projects/:projectId/items/delete', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { path: itemPath } = req.body;
  
  if (!itemPath) {
    return res.status(400).json({ 
      success: false, 
      error: 'Item path is required' 
    });
  }

  const result = await fileSystemService.deleteItem(projectId, itemPath);
  res.json(result);
}));

app.patch('/api/projects/:projectId/items/rename', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { oldPath, newPath } = req.body;
  
  if (!oldPath || !newPath) {
    return res.status(400).json({ 
      success: false, 
      error: 'Both old and new paths are required' 
    });
  }

  const result = await fileSystemService.renameItem(projectId, oldPath, newPath);
  res.json(result);
}));

app.post('/api/projects/:projectId/initialize', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const result = await fileSystemService.initializeProject(projectId);
  res.json(result);
}));

app.get('/api/projects/:projectId/search', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { q: query } = req.query;
  
  if (!query) {
    return res.status(400).json({ 
      success: false, 
      error: 'Search query is required' 
    });
  }

  const result = await fileSystemService.searchFiles(projectId, query);
  res.json(result);
}));

app.get('/api/projects/:projectId/metadata', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { path: filePath } = req.query;
  
  if (!filePath) {
    return res.status(400).json({ 
      success: false, 
      error: 'File path is required' 
    });
  }

  const result = await fileSystemService.getFileMetadata(projectId, filePath);
  res.json(result);
}));

app.post('/api/projects/:projectId/copy', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { sourcePath, destinationPath } = req.body;
  
  if (!sourcePath || !destinationPath) {
    return res.status(400).json({ 
      success: false, 
      error: 'Both source and destination paths are required' 
    });
  }

  const result = await fileSystemService.copyItem(projectId, sourcePath, destinationPath);
  res.json(result);
}));

app.post('/api/projects/:projectId/move', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { sourcePath, destinationPath } = req.body;

  if (!sourcePath || !destinationPath) {
    return res.status(400).json({
      success: false,
      error: 'Both source and destination paths are required'
    });
  }

  const result = await fileSystemService.moveItem(projectId, sourcePath, destinationPath);
  res.json(result);
}));

// ==================== VERSION MANAGEMENT API ROUTES ====================

// Get versioning status for the bucket
app.get('/api/versioning/status', asyncHandler(async (req, res) => {
  const result = await fileSystemService.getVersioningStatus();
  res.json(result);
}));

// Enable versioning on the bucket (admin endpoint - run once)
app.post('/api/versioning/enable', asyncHandler(async (req, res) => {
  const result = await fileSystemService.enableVersioning();
  res.json(result);
}));

// List all versions of a specific file
app.get('/api/projects/:projectId/files/versions', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { path: filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({
      success: false,
      error: 'File path is required (use ?path=...)'
    });
  }

  const result = await fileSystemService.listFileVersions(projectId, filePath);
  res.json(result);
}));

// Get current (latest) version ID of a file
app.get('/api/projects/:projectId/files/current-version', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { path: filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({
      success: false,
      error: 'File path is required (use ?path=...)'
    });
  }

  const result = await fileSystemService.getCurrentVersionId(projectId, filePath);
  res.json(result);
}));

// Get content of a specific version
app.get('/api/projects/:projectId/files/version/:versionId', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId, versionId } = req.params;
  const { path: filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({
      success: false,
      error: 'File path is required (use ?path=...)'
    });
  }

  const result = await fileSystemService.getFileVersion(projectId, filePath, versionId);
  res.json(result);
}));

// Restore file to a specific version
app.post('/api/projects/:projectId/files/restore', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { path: filePath, versionId } = req.body;

  if (!filePath || !versionId) {
    return res.status(400).json({
      success: false,
      error: 'Both file path and versionId are required'
    });
  }

  const result = await fileSystemService.restoreFileVersion(projectId, filePath, versionId);
  res.json(result);
}));

// Delete a specific version
app.delete('/api/projects/:projectId/files/version/:versionId', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId, versionId } = req.params;
  const { path: filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({
      success: false,
      error: 'File path is required in request body'
    });
  }

  const result = await fileSystemService.deleteFileVersion(projectId, filePath, versionId);
  res.json(result);
}));

// ============================================================
// Version Retention Strategy Endpoints (Strategy Pattern)
// ============================================================

// Apply retention policy to a specific file
app.post('/api/projects/:projectId/retention/apply', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { path: filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({
      success: false,
      error: 'File path is required in request body'
    });
  }

  const result = await versionRetentionManager.applyRetentionPolicy(projectId, filePath);
  res.json(result);
}));

// Apply retention policy to all files in a project
app.post('/api/projects/:projectId/retention/apply-all', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const result = await versionRetentionManager.applyRetentionPolicyToProject(projectId);
  res.json(result);
}));

// Change retention strategy (demonstrates Strategy Pattern runtime swapping)
app.post('/api/retention/strategy', asyncHandler(async (req, res) => {
  const { strategyType, options } = req.body;

  if (!strategyType) {
    return res.status(400).json({
      success: false,
      error: 'Strategy type is required (keepRecent, timeBased, tagged)'
    });
  }

  let newStrategy;

  switch (strategyType) {
    case 'keepRecent':
      const maxVersions = options?.maxVersions || 10;
      newStrategy = new KeepRecentVersionsStrategy(maxVersions);
      break;

    case 'timeBased':
      newStrategy = new TimeBasedRetentionStrategy(options || {});
      break;

    case 'tagged':
      newStrategy = new TaggedVersionsStrategy();
      break;

    default:
      return res.status(400).json({
        success: false,
        error: 'Invalid strategy type. Use: keepRecent, timeBased, or tagged'
      });
  }

  versionRetentionManager.setStrategy(newStrategy);

  res.json({
    success: true,
    message: `Retention strategy changed to ${newStrategy.getName()}`,
    strategy: newStrategy.getName()
  });
}));

// Get current retention strategy
app.get('/api/retention/strategy', asyncHandler(async (req, res) => {
  const currentStrategy = versionRetentionManager.strategy;

  res.json({
    success: true,
    strategy: currentStrategy.getName(),
    description: getStrategyDescription(currentStrategy)
  });
}));

// Helper function to describe current strategy
function getStrategyDescription(strategy) {
  const name = strategy.getName();

  if (name.startsWith('KeepRecent')) {
    return `Keeps the most recent N versions, deletes older ones`;
  } else if (name.startsWith('TimeBased')) {
    return `Keeps all versions from last 24h, 1/day for 7 days, 1/week for 30 days`;
  } else if (name === 'TaggedVersions') {
    return `Keeps only tagged/release versions plus latest`;
  }

  return 'Unknown strategy';
}

// Container Management API Routes
app.get('/api/projects/:projectId/container/status', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const containers = await containerService.listContainers();
  const container = containers.find(c => c.projectId === projectId);
  
  res.json({
    success: true,
    status: container ? container.state : 'stopped',
    container: container || null
  });
}));

app.post('/api/projects/:projectId/container/start', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const containerInfo = await containerService.createContainer(projectId);
  
  res.json({
    success: true,
    containerId: containerInfo.id,
    message: 'Container started successfully'
  });
}));

app.post('/api/projects/:projectId/container/stop', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  await containerService.stopContainer(projectId);
  
  res.json({
    success: true,
    message: 'Container stopped successfully'
  });
}));

app.get('/api/projects/:projectId/container/stats', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const stats = await containerService.getContainerStats(projectId);
  
  if (!stats) {
    return res.status(404).json({
      success: false,
      error: 'Container not found or not running'
    });
  }
  
  res.json({
    success: true,
    stats
  });
}));

app.get('/api/projects/:projectId/container/ssh', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const containers = await containerService.listContainers();
  const container = containers.find(c => c.projectId === projectId);
  if (!container || !container.sshPort) {
    return res.status(404).json({ success: false, error: 'Container not running or SSH port not available' });
  }
  res.json({
    success: true,
    host: 'localhost',
    port: container.sshPort,
    user: 'developer'
  });
}));

app.post('/api/projects/:projectId/container/ssh/connect', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { command, script } = req.body;
  
  if (!command || !script) {
    return res.status(400).json({ 
      success: false, 
      error: 'Command and script are required' 
    });
  }
  
  try {
    // Execute AppleScript to open Terminal.app with SSH command
    await execAsync(`osascript -e '${script}'`);
    
    res.json({
      success: true,
      message: 'SSH terminal opened successfully'
    });
  } catch (error) {
    console.error('Failed to execute AppleScript:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to open SSH terminal'
    });
  }
}));

// Port forwarding and web preview endpoints
app.get('/api/projects/:projectId/ports', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const ports = await containerService.getActivePortsForProject(projectId);
  
  res.json({
    success: true,
    ports
  });
}));

app.post('/api/projects/:projectId/ports/refresh', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  
  // Force a port check
  await containerService.checkContainerPorts(projectId);
  const ports = await containerService.getActivePortsForProject(projectId);
  
  res.json({
    success: true,
    ports,
    message: 'Port scan completed'
  });
}));

// Output management endpoints
app.get('/api/projects/:projectId/output/console', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { lines = 100 } = req.query;
  
  // Get recent console output (this would be stored in memory or a log file)
  const output = outputManager.getConsoleOutput(projectId, parseInt(lines));
  
  res.json({
    success: true,
    output,
    projectId
  });
}));

app.post('/api/projects/:projectId/output/clear', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  
  // Clear console output
  outputManager.clearConsoleOutput(projectId);
  
  res.json({
    success: true,
    message: 'Console output cleared'
  });
}));

// Process management endpoints
app.get('/api/projects/:projectId/processes', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const processes = await containerService.getRunningProcesses(projectId);
  
  res.json({
    success: true,
    processes
  });
}));

app.post('/api/projects/:projectId/processes/:pid/kill', validateProjectId, asyncHandler(async (req, res) => {
  const { projectId, pid } = req.params;
  
  await containerService.killProcess(projectId, pid);
  
  res.json({
    success: true,
    message: `Process ${pid} killed`
  });
}));

app.get('/api/containers', asyncHandler(async (req, res) => {
  const containers = await containerService.listContainers();
  res.json({
    success: true,
    containers
  });
}));

// Collaboration API Routes
app.get('/api/collaboration/metrics', asyncHandler(async (req, res) => {
  if (!collaborationService) {
    return res.status(503).json({
      success: false,
      error: 'Collaboration service not initialized'
    });
  }

  const metrics = collaborationService.getAllMetrics();
  res.json({
    success: true,
    metrics,
    pubsub: collabPubSub ? collabPubSub.stats : null,
    websocket: connectionManager.getStats()
  });
}));

app.get('/api/collaboration/rooms/:docId/metrics', asyncHandler(async (req, res) => {
  if (!collaborationService) {
    return res.status(503).json({
      success: false,
      error: 'Collaboration service not initialized'
    });
  }

  const { docId } = req.params;
  const room = collaborationService.rooms.get(docId);

  if (!room) {
    return res.status(404).json({
      success: false,
      error: 'Room not found'
    });
  }

  res.json({
    success: true,
    metrics: room.getMetrics()
  });
}));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`❌ Error in ${req.method} ${req.path}:`, err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    success: false,
    error: isDevelopment ? err.message : 'Internal server error',
    requestId: req.id,
    ...(isDevelopment && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Start server
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await initializeServices();
});

// Basic cookie parser for WS authentication
function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((acc, pair) => {
    const [key, value] = pair.trim().split('=');
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});
}

function extractTokenFromRequest(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies.token || cookies.authToken || cookies.access_token) {
    return cookies.token || cookies.authToken || cookies.access_token;
  }

  try {
    const url = new URL(req.url, 'ws://localhost');
    return url.searchParams.get('token');
  } catch (_) {
    return null;
  }
}

function verifyJwtToken(token) {
  if (!token) {
    throw new Error('Missing token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const headerJson = Buffer.from(headerB64, 'base64url').toString('utf8');
  const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const header = JSON.parse(headerJson);
  const payload = JSON.parse(payloadJson);

  const signingInput = `${headerB64}.${payloadB64}`;

  let valid = false;
  if (header.alg === 'HS256') {
    if (!WS_JWT_SECRET) {
      throw new Error('No HS256 secret configured');
    }
    const expected = crypto
      .createHmac('sha256', WS_JWT_SECRET)
      .update(signingInput)
      .digest('base64url');
    valid = expected === signatureB64;
  } else if (header.alg && header.alg.startsWith('RS')) {
    if (!WS_JWT_PUBLIC_KEY) {
      throw new Error(`No public key configured for ${header.alg}`);
    }
    const verify = crypto.createVerify(`RSA-${header.alg.slice(2)}`);
    verify.update(signingInput);
    verify.end();
    valid = verify.verify(WS_JWT_PUBLIC_KEY, Buffer.from(signatureB64, 'base64url'));
  } else {
    throw new Error(`Unsupported JWT alg: ${header.alg || 'unknown'}`);
  }

  if (!valid) {
    throw new Error('Invalid JWT signature');
  }

  if (payload.exp && Date.now() >= payload.exp * 1000) {
    throw new Error('JWT expired');
  }

  return payload;
}

function verifyWebSocketClient(info, done) {
  const isProduction = (process.env.NODE_ENV || 'development') === 'production';
  const hasJwtMaterial = !!WS_JWT_SECRET || !!WS_JWT_PUBLIC_KEY;

  if (!hasJwtMaterial) {
    if (isProduction && !WS_ALLOW_ANONYMOUS) {
      console.error('❌ WS authentication failed: no JWT secret/public key configured');
      return done(false, 401, 'Unauthorized');
    }

    console.warn('⚠️  WS authentication bypassed (no JWT material configured)');
    return done(true);
  }

  try {
    const token = extractTokenFromRequest(info.req);
    const claims = verifyJwtToken(token);
    info.req.user = claims;
    return done(true);
  } catch (err) {
    console.error('❌ WS authentication error:', err.message);
    return done(false, 401, 'Unauthorized');
  }
}

// Enhanced WebSocket Server
const wss = new WebSocket.Server({ 
  server,
  verifyClient: verifyWebSocketClient
});

// Connection manager for WebSocket connections
class CrossInstancePubSub {
  constructor(instanceId) {
    this.instanceId = instanceId;
    this.channel = process.env.WS_REDIS_CHANNEL || 'ws:broadcast';
    this.enabled = false;
    this.publisher = null;
    this.subscriber = null;
    this.onMessage = null;
  }

  async init() {
    const redisUrl = process.env.WS_REDIS_URL || process.env.REDIS_URL;
    if (!redisUrl) {
      console.log('ℹ️  WS cross-instance pub/sub disabled (no WS_REDIS_URL/REDIS_URL set)');
      return;
    }

    let createClient;
    try {
      ({ createClient } = require('redis'));
    } catch (err) {
      console.warn('⚠️  Redis client not installed; skipping WS pub/sub', err.message);
      return;
    }

    this.publisher = createClient({ url: redisUrl });
    this.subscriber = createClient({ url: redisUrl });

    this.publisher.on('error', (err) => console.error('Redis pub error:', err));
    this.subscriber.on('error', (err) => console.error('Redis sub error:', err));

    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);

    await this.subscriber.subscribe(this.channel, (raw) => {
      try {
        const payload = JSON.parse(raw);
        if (!payload || payload.originId === this.instanceId) {
          return;
        }
        if (typeof this.onMessage === 'function') {
          this.onMessage(payload);
        }
      } catch (err) {
        console.error('Failed to process pub/sub WS payload:', err);
      }
    });

    this.enabled = true;
    console.log(`📡 Cross-instance WS pub/sub enabled on channel "${this.channel}"`);
  }

  async publish(message) {
    if (!this.enabled || !this.publisher) return;
    try {
      await this.publisher.publish(this.channel, JSON.stringify({
        ...message,
        originId: this.instanceId
      }));
    } catch (err) {
      console.error('Failed to publish WS message to Redis:', err);
    }
  }

  async close() {
    try {
      if (this.subscriber) {
        await this.subscriber.unsubscribe(this.channel);
        await this.subscriber.quit();
      }
      if (this.publisher) {
        await this.publisher.quit();
      }
    } catch (err) {
      console.error('Error closing pub/sub clients:', err);
    }
  }
}

class ConnectionManager {
  constructor(pubSubBridge = null) {
    this.connections = new Map(); // connectionId -> connection info
    this.projectConnections = new Map(); // projectId -> Set of connectionIds
    this.pubSubBridge = pubSubBridge;

    if (this.pubSubBridge) {
      this.pubSubBridge.onMessage = (payload) => this.handleRemoteBroadcast(payload);
    }
  }

  addConnection(ws, type, projectId, metadata = {}) {
    const connectionId = `${type}-${projectId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const connectionInfo = {
      id: connectionId,
      ws,
      type,
      projectId,
      metadata,
      createdAt: new Date(),
      lastActivity: new Date()
    };

    this.connections.set(connectionId, connectionInfo);
    
    if (!this.projectConnections.has(projectId)) {
      this.projectConnections.set(projectId, new Set());
    }
    this.projectConnections.get(projectId).add(connectionId);
    
    console.log(`📌 New ${type} connection: ${connectionId} for project: ${projectId}`);
    return connectionId;
  }

  removeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      const { projectId } = connection;
      
      this.connections.delete(connectionId);
      
      const projectConns = this.projectConnections.get(projectId);
      if (projectConns) {
        projectConns.delete(connectionId);
        if (projectConns.size === 0) {
          this.projectConnections.delete(projectId);
        }
      }
      
      console.log(`🗑️  Removed connection: ${connectionId}`);
    }
  }

  getProjectConnections(projectId, type = null) {
    const projectConns = this.projectConnections.get(projectId);
    if (!projectConns) return [];
    
    return Array.from(projectConns)
      .map(id => this.connections.get(id))
      .filter(conn => conn && (!type || conn.type === type));
  }

  broadcast(projectId, message, excludeConnectionId = null, options = {}) {
    const { skipRemote = false } = options;
    this.broadcastLocal(projectId, message, excludeConnectionId);

    if (!skipRemote && this.pubSubBridge?.enabled) {
      this.pubSubBridge.publish({ projectId, message, excludeConnectionId });
    }
  }

  broadcastLocal(projectId, message, excludeConnectionId = null) {
    const connections = this.getProjectConnections(projectId);
    
    for (const conn of connections) {
      if (conn.id !== excludeConnectionId && conn.ws.readyState === WebSocket.OPEN) {
        try {
          conn.ws.send(JSON.stringify(message));
          conn.lastActivity = new Date();
        } catch (error) {
          console.error(`Error broadcasting to ${conn.id}:`, error);
          this.removeConnection(conn.id);
        }
      }
    }
  }

  handleRemoteBroadcast(payload) {
    if (!payload || !payload.projectId || !payload.message) {
      return;
    }

    applyRemoteFileMessage(payload.projectId, payload.message).catch((err) => {
      console.error('❌ Failed to apply remote file message:', err);
    });

    this.broadcastLocal(payload.projectId, payload.message, payload.excludeConnectionId);
  }

  getStats() {
    return {
      totalConnections: this.connections.size,
      projects: this.projectConnections.size,
      connectionsByType: Array.from(this.connections.values()).reduce((acc, conn) => {
        acc[conn.type] = (acc[conn.type] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

const crossInstancePubSub = new CrossInstancePubSub(INSTANCE_ID);
const collabPubSub = new CollabPubSub(INSTANCE_ID);
const connectionManager = new ConnectionManager(crossInstancePubSub);

// Function to set up event handlers after services are initialized
function setupEventHandlers() {
  // Set up container service event handlers
  containerService.on('port:detected', (data) => {
    console.log(`🔊 Broadcasting port:detected for project ${data.projectId}`);
    connectionManager.broadcast(data.projectId, {
      type: 'port:detected',
      ...data
    });
  });

  containerService.on('port:stopped', (data) => {
    console.log(`🔊 Broadcasting port:stopped for project ${data.projectId}`);
    connectionManager.broadcast(data.projectId, {
      type: 'port:stopped',
      ...data
    });
  });

  containerService.on('files:changed', (data) => {
    console.log(`🔊 Broadcasting files:changed for project ${data.projectId}`, data.changes);
    connectionManager.broadcast(data.projectId, {
      type: 'files:changed',
      ...data
    });
  });

  containerService.on('process:killed', (data) => {
    console.log(`🔊 Broadcasting process:killed for project ${data.projectId}`);
    connectionManager.broadcast(data.projectId, {
      type: 'process:killed',
      ...data
    });
  });

  // Set up output manager event handlers
  outputManager.on('console:output', (data) => {
    connectionManager.broadcast(data.projectId, {
      type: 'console:output',
      ...data
    });
  });

  outputManager.on('process:output', (data) => {
    connectionManager.broadcast(data.projectId, {
      type: 'process:output',
      ...data
    });
  });
}

// WebSocket connection handler
wss.on("connection", (ws, req) => {
  console.log("🔌 New WebSocket connection");


  
  // Parse connection parameters
  const url = new URL(req.url, `http://${req.headers.host}`);
  const type = url.searchParams.get('type') || 'terminal';
  const projectId = url.searchParams.get('projectId');
  const userClaims = req.user || {};
  
  
  console.log(`🔌 New WebSocket connection:`);
  console.log(`  Type: ${type}`);
  console.log(`  Project ID: ${projectId}`);
  console.log(`  URL: ${req.url}`);
  console.log(`  Headers:`, req.headers);
  // Validate required parameters
  if (!projectId) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Project ID is required',
      code: 'MISSING_PROJECT_ID'
    }));
    ws.close(1008, 'Project ID required');
    return;
  }

  if (!validateProjectIdFormat(projectId)) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Invalid project ID format',
      code: 'INVALID_PROJECT_ID'
    }));
    ws.close(1008, 'Invalid project ID');
    return;
  }

  if (!WS_ALLOW_ANONYMOUS) {
    const hasAuth = userClaims && (userClaims.sub || userClaims.user_id || userClaims.id);
    if (!hasAuth) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }));
      ws.close(1008, 'Authentication required');
      return;
    }
  }

  const connectionId = connectionManager.addConnection(ws, type, projectId, {
    userAgent: req.headers['user-agent'],
    ip: req.connection.remoteAddress,
    userId: userClaims.sub || userClaims.user_id || userClaims.id,
    auth: userClaims
  });
  ws.user = userClaims;

  // Set up ping/pong for connection health
  let pingInterval;
  let isAlive = true;

  ws.on('pong', () => {
    isAlive = true;
  });

  pingInterval = setInterval(() => {
    if (!isAlive) {
      console.log(`Connection ${connectionId} appears dead, terminating`);
      clearInterval(pingInterval);
      connectionManager.removeConnection(connectionId);
      ws.terminate();
      return;
    }
    
    isAlive = false;
    ws.ping();
  }, 30000); // 30 second ping interval

  // Route to appropriate handler
  try {
    switch (type) {
      case 'terminal':
        handleTerminalConnection(ws, projectId, connectionId);
        break;

      case 'watcher':
        handleFileWatcherConnection(ws, projectId, connectionId);
        break;

      case 'file-collab':
        handleFileCollabConnection(ws, projectId, connectionId, url);
        break;

      case 'collaboration':
        handleCollaborationConnection(ws, projectId, connectionId, url);
        break;

      default:
        throw new Error(`Unknown connection type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Error setting up ${type} connection:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message,
      code: 'CONNECTION_SETUP_FAILED'
    }));
    ws.close(1011, 'Setup failed');
  }

  ws.on("close", (code, reason) => {
    console.log(`🔌 WebSocket closed: ${connectionId} (code: ${code})`);
    clearInterval(pingInterval);
    connectionManager.removeConnection(connectionId);
  });

  ws.on("error", (error) => {
    console.error(`🔌 WebSocket error on ${connectionId}:`, error);
    clearInterval(pingInterval);
    connectionManager.removeConnection(connectionId);
  });
});

async function handleTerminalConnection(ws, projectId, connectionId) {
  try {
    await containerService.handleWebSocketConnection(ws, projectId);
  } catch (error) {
    console.error(`❌ Terminal connection error for ${connectionId}:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to create terminal session',
      code: 'TERMINAL_CREATION_FAILED'
    }));
  }
}

function handleCollaborationConnection(ws, projectId, connectionId, url) {
  const docId = url.searchParams.get('docId') || projectId;
  const authenticatedUserId = ws.user?.sub || ws.user?.user_id || ws.user?.id;
  const authenticatedName = ws.user?.name || ws.user?.preferred_username;
  const userId = authenticatedUserId || url.searchParams.get('userId') || connectionId;
  const userName = authenticatedName || url.searchParams.get('userName') || 'Anonymous';
  const userColor = url.searchParams.get('userColor') || generateRandomColor();

  console.log(`👥 Collaboration connection - Room: ${docId}, User: ${userName}`);

  const room = collaborationService.getRoom(docId);

  const userInfo = {
    id: userId,
    name: userName,
    color: userColor,
    connectionId
  };

  room.addConnection(connectionId, ws, userInfo);

  const confirmMessage = JSON.stringify({
    type: 'collaboration:connected',
    docId,
    userId,
    connectionId,
    timestamp: Date.now()
  });

  if (ws.readyState === ws.OPEN) {
    ws.send(confirmMessage);
  }
}

function handleFileCollabConnection(ws, projectId, connectionId, url) {
  const filePath = url.searchParams.get('path');
  if (!filePath) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'File path is required for file-collab',
      code: 'MISSING_FILE_PATH'
    }));
    ws.close(1008, 'File path required');
    return;
  }

  const docId = getFileDocId(projectId, filePath);
  const authenticatedUserId = ws.user?.sub || ws.user?.user_id || ws.user?.id;
  const authenticatedName = ws.user?.name || ws.user?.preferred_username;
  const userId = authenticatedUserId || url.searchParams.get('userId') || connectionId;
  const userName = authenticatedName || url.searchParams.get('userName') || 'Anonymous';
  const userColor = url.searchParams.get('userColor') || generateRandomColor();

  console.log(`👥 File collaboration - Doc: ${docId}, File: ${filePath}, User: ${userName}`);

  const room = collaborationService.getRoom(docId);

  const userInfo = {
    id: userId,
    name: userName,
    color: userColor,
    connectionId,
    filePath
  };

  room.addConnection(connectionId, ws, userInfo);

  const confirmMessage = JSON.stringify({
    type: 'file-collab:connected',
    docId,
    filePath,
    userId,
    connectionId,
    timestamp: Date.now()
  });

  if (ws.readyState === ws.OPEN) {
    ws.send(confirmMessage);
  }
}

function generateRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function getFileStateKey(projectId, filePath) {
  return `${projectId}:${filePath}`;
}

function getFileDocId(projectId, filePath) {
  return `file:${projectId}:${filePath}`;
}

function enqueueFileOperation(key, handler) {
  const previous = fileOperationQueues.get(key) || Promise.resolve();
  const next = previous
    .then(handler)
    .catch((err) => {
      console.error(`❌ File operation failed for ${key}:`, err);
    })
    .finally(() => {
      if (fileOperationQueues.get(key) === next) {
        fileOperationQueues.delete(key);
      }
    });

  fileOperationQueues.set(key, next);
  return next;
}

function applyTextDelta(baseContent, delta) {
  if (
    !delta ||
    typeof delta.start !== 'number' ||
    typeof delta.end !== 'number' ||
    delta.start < 0 ||
    delta.end < delta.start
  ) {
    throw new Error('Invalid delta payload');
  }

  const replacement = typeof delta.text === 'string' ? delta.text : '';
  if (delta.end > baseContent.length) {
    throw new Error('Delta end exceeds document length');
  }

  return baseContent.slice(0, delta.start) + replacement + baseContent.slice(delta.end);
}

/**
 * Best-effort delta application when versions diverge.
 * Tries to apply using provided offsets if still valid; otherwise returns null.
 */
function tryApplyDeltaOnDivergedContent(currentContent, delta) {
  if (
    !delta ||
    typeof delta.start !== 'number' ||
    typeof delta.end !== 'number' ||
    delta.start < 0 ||
    delta.start > currentContent.length ||
    delta.end < delta.start ||
    delta.end > currentContent.length
  ) {
    return null;
  }

  const replacement = typeof delta.text === 'string' ? delta.text : '';
  try {
    return (
      currentContent.slice(0, delta.start) +
      replacement +
      currentContent.slice(delta.end)
    );
  } catch (_) {
    return null;
  }
}

function diffToSingleRangeDelta(oldText, newText) {
  if (oldText === newText) {
    return { start: 0, end: 0, text: '' };
  }

  let start = 0;
  const minLength = Math.min(oldText.length, newText.length);
  while (start < minLength && oldText[start] === newText[start]) {
    start++;
  }

  let endOld = oldText.length - 1;
  let endNew = newText.length - 1;
  while (endOld >= start && endNew >= start && oldText[endOld] === newText[endNew]) {
    endOld--;
    endNew--;
  }

  return {
    start,
    end: endOld + 1,
    text: newText.slice(start, endNew + 1)
  };
}

async function loadFileState(projectId, filePath) {
  if (!fileSystemService) {
    throw new Error('File system service not initialized');
  }

  const cacheKey = getFileStateKey(projectId, filePath);

  if (!fileStateCache.has(cacheKey)) {
    let content = '';
    try {
      const existing = await fileSystemService.readFile(projectId, filePath);
      if (existing && typeof existing.content === 'string') {
        content = existing.content;
      }
    } catch (err) {
      console.warn(`⚠️  Could not read ${filePath} for project ${projectId}:`, err.message);
    }
    fileStateCache.set(cacheKey, { version: 0, content });
  }

  return fileStateCache.get(cacheKey);
}

function schedulePersistToStorage(cacheKey, projectId, filePath, state) {
  if (filePersistTimers.has(cacheKey)) {
    clearTimeout(filePersistTimers.get(cacheKey));
  }

  const timer = setTimeout(async () => {
    filePersistTimers.delete(cacheKey);

    try {
      if (fileSystemService) {
        await fileSystemService.updateFile(projectId, filePath, state.content);
      }
    } catch (err) {
      console.error(`❌ Failed to persist ${filePath} to storage:`, err);
    }

    try {
      if (containerService) {
        await containerService.syncFileToContainer(projectId, filePath, state.content);
      }
    } catch (err) {
      console.error(`❌ Failed to sync ${filePath} to container:`, err);
    }
  }, FILE_PERSIST_DEBOUNCE_MS);

  filePersistTimers.set(cacheKey, timer);
}

async function applyRemoteFileMessage(projectId, message) {
  if (!message || !message.path) {
    return;
  }

  if (message.type !== 'file:delta' && message.type !== 'file:updated') {
    return;
  }

  const cacheKey = getFileStateKey(projectId, message.path);

  await enqueueFileOperation(cacheKey, async () => {
    const state = await loadFileState(projectId, message.path);

    try {
      if (message.type === 'file:delta' && message.delta) {
        // Refresh cache if versions diverged before applying delta
        if (typeof message.baseVersion === 'number' && message.baseVersion !== state.version) {
          try {
            const fresh = await fileSystemService.readFile(projectId, message.path);
            if (fresh && typeof fresh.content === 'string') {
              state.content = fresh.content;
              state.version = message.baseVersion;
            }
          } catch (err) {
            console.warn(`⚠️  Could not refresh ${message.path} before applying remote delta:`, err.message);
          }
        }

        state.content = applyTextDelta(state.content, message.delta);
        state.version = message.version || state.version + 1;
      } else if (message.type === 'file:updated' && typeof message.content === 'string') {
        state.content = message.content;
        state.version = message.version || state.version + 1;
      } else if (message.type === 'file:updated' && typeof message.version === 'number') {
        // At least keep version in sync for conflict detection
        state.version = Math.max(state.version, message.version);
      }
    } catch (err) {
      console.error(`❌ Failed to apply remote file message for ${message.path}:`, err);
      fileStateCache.delete(cacheKey); // force reload on next operation
    }
  });
}

function handleFileWatcherConnection(ws, projectId, connectionId) {
  ws.send(JSON.stringify({
    type: 'watcher:connected',
    projectId,
    connectionId
  }));

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(typeof message === 'string' ? message : message.toString());
      if (!msg || !msg.type) {
        return;
      }
      
      switch (msg.type) {
        case 'file:delta': {
          if (!msg.path || !msg.delta) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid delta payload',
              code: 'INVALID_DELTA'
            }));
            return;
          }

          const cacheKey = getFileStateKey(projectId, msg.path);
          enqueueFileOperation(cacheKey, async () => {
            const state = await loadFileState(projectId, msg.path);
            const expectedVersion = typeof msg.baseVersion === 'number' ? msg.baseVersion : state.version;

            let deltaAlreadyApplied = false;

            if (typeof msg.baseVersion === 'number' && msg.baseVersion !== state.version) {
              // Attempt best-effort application on current content
              const maybeContent = tryApplyDeltaOnDivergedContent(state.content, msg.delta);
              if (maybeContent === null) {
                ws.send(JSON.stringify({
                  type: 'file:resync-required',
                  path: msg.path,
                  serverVersion: state.version,
                  receivedVersion: msg.baseVersion
                }));
                return;
              }
              state.content = maybeContent;
              deltaAlreadyApplied = true;
              // keep expectedVersion as the client base to broadcast
            }

            try {
              if (!deltaAlreadyApplied) {
                const nextContent = applyTextDelta(state.content, msg.delta);
                state.content = nextContent;
              }
              state.version = state.version + 1;

              const broadcastPayload = {
                type: 'file:delta',
                path: msg.path,
                delta: msg.delta,
                version: state.version,
                baseVersion: expectedVersion,
                updatedBy: connectionId,
                timestamp: Date.now()
              };

              // Optimistic broadcast (do not wait for disk/container)
              connectionManager.broadcast(projectId, broadcastPayload, connectionId);
              connectionManager.broadcast(projectId, {
                type: 'file:updated',
                path: msg.path,
                version: state.version,
                updatedBy: connectionId,
                timestamp: Date.now()
              }, connectionId);
              schedulePersistToStorage(cacheKey, projectId, msg.path, state);
            } catch (err) {
              console.error(`❌ Failed to apply delta for ${msg.path}:`, err);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to apply delta',
                code: 'DELTA_APPLY_FAILED'
              }));
            }
          });
          break;
        }

        case 'file:changed':
          if (msg.path && msg.content !== undefined) {
            const cacheKey = getFileStateKey(projectId, msg.path);
            const incomingContent = typeof msg.content === 'string' ? msg.content : String(msg.content);

            enqueueFileOperation(cacheKey, async () => {
              const state = await loadFileState(projectId, msg.path);
              const delta = diffToSingleRangeDelta(state.content, incomingContent);
              state.content = incomingContent;
              state.version = state.version + 1;

              const deltaMessage = {
                type: 'file:delta',
                path: msg.path,
                delta,
                version: state.version,
                baseVersion: state.version - 1,
                legacy: true,
                updatedBy: connectionId,
                timestamp: Date.now()
              };

              // Broadcast minimal payload; persistence happens asynchronously
              connectionManager.broadcast(projectId, deltaMessage, connectionId);
              connectionManager.broadcast(projectId, {
                type: 'file:updated',
                path: msg.path,
                version: state.version,
                updatedBy: connectionId,
                timestamp: Date.now()
              }, connectionId);

              schedulePersistToStorage(cacheKey, projectId, msg.path, state);
            });
          }
          break;
          
        case 'file:watch':
          ws.send(JSON.stringify({
            type: 'file:watching',
            path: msg.path
          }));
          break;
      }
    } catch (error) {
      console.error(`❌ File watcher message error for ${connectionId}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process file watcher message',
        code: 'WATCHER_MESSAGE_FAILED'
      }));
    }
  });
}

// Utility function to validate project ID format
function validateProjectIdFormat(projectId) {
  return /^[a-zA-Z0-9\-_]+$/.test(projectId) && projectId.length <= 100;
}

// Cleanup and monitoring
setInterval(() => {
  const stats = connectionManager.getStats();
  console.log(`📊 WebSocket Stats:`, stats);
}, 5 * 60 * 1000); // Every 5 minutes

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
  
  // Close WebSocket server
  wss.close(() => {
    console.log('✅ WebSocket server closed');
  });
  if (crossInstancePubSub) {
    await crossInstancePubSub.close();
  }
  if (collabPubSub) {
    await collabPubSub.close();
  }
  
  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });
  
  // Shutdown container service
  if (containerService) {
    await containerService.shutdown();
  }
  
  // Close HTTP server
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  
  // Force exit after 30 seconds
  setTimeout(() => {
    console.log('❌ Force shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

module.exports = { app, server, wss, connectionManager };
