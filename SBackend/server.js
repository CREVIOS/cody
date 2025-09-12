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

// Services
const FileSystemService = require("./services/fileSystemService");
const ContainerService = require("./services/containerService");
const OutputManager = require("./services/outputManager");

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

async function initializeServices() {
  try {
    console.log('🚀 Initializing services...');
    
    fileSystemService = new FileSystemService();
    outputManager = new OutputManager();
    containerService = new ContainerService(fileSystemService);
    
    // Connect output manager to container service
    containerService.outputManager = outputManager;
    
    // Wait for container service to initialize
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Container service initialization timeout'));
      }, 30000); // 30 second timeout
      
      containerService.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      // If no ready event, resolve after a short delay
      setTimeout(resolve, 1000);
    });
    
    // Set up event handlers after services are initialized
    setupEventHandlers();
    
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
      containers: 'healthy'
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
  const structure = await fileSystemService.getProjectStructure(projectId);
  res.json({ success: true, structure });
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

// Enhanced WebSocket Server
const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => {
    // Add WebSocket authentication here if needed
    return true;
  }
});

// Connection manager for WebSocket connections
class ConnectionManager {
  constructor() {
    this.connections = new Map(); // connectionId -> connection info
    this.projectConnections = new Map(); // projectId -> Set of connectionIds
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

  broadcast(projectId, message, excludeConnectionId = null) {
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

const connectionManager = new ConnectionManager();

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

  const connectionId = connectionManager.addConnection(ws, type, projectId, {
    userAgent: req.headers['user-agent'],
    ip: req.connection.remoteAddress
  });

  // Set up ping/pong for connection health
  let pingInterval;
  let isAlive = true;

  ws.on('pong', () => {
    isAlive = true;
  });

  pingInterval = setInterval(() => {
    if (!isAlive) {
      console.log(`💀 Connection ${connectionId} appears dead, terminating`);
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

  // Universal cleanup on connection close
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

// Terminal connection handler
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

// File watcher connection handler
function handleFileWatcherConnection(ws, projectId, connectionId) {
  ws.send(JSON.stringify({
    type: 'watcher:connected',
    projectId,
    connectionId
  }));

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);
      
      switch (msg.type) {
        case 'file:changed':
          if (msg.path && msg.content !== undefined) {
            // Update file in filesystem
            await fileSystemService.updateFile(projectId, msg.path, msg.content);
            
            // Sync to container
            await containerService.syncFileToContainer(projectId, msg.path, msg.content);
            
            // Broadcast to other watchers
            connectionManager.broadcast(projectId, {
              type: 'file:updated',
              path: msg.path,
              updatedBy: connectionId,
              timestamp: Date.now()
            }, connectionId);
          }
          break;
          
        case 'file:watch':
          // Add file to watch list
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