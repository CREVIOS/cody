// NOTE: In the future, support virtual file system commands like `pwd`, `ls`, `cd` and 'whoami'
// directly in frontend before sending to backend shell. This will allow simulating
// filesystem navigation and output within the editor UI.

const express = require("express");
const WebSocket = require("ws");
const cors = require("cors");
const { exec } = require("child_process");
const FileSystemService = require("./services/fileSystemService");

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize file system service
const fileSystemService = new FileSystemService();

// Project Management API Routes

// List all projects
app.get('/api/projects', async (req, res) => {
  try {
    const result = await fileSystemService.listProjects();
    res.json(result);
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete project
app.delete('/api/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'Project ID is required' });
    }

    // Check if project exists
    const exists = await fileSystemService.projectExists(projectId);
    if (!exists.exists) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const result = await fileSystemService.deleteProject(projectId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check if project exists
app.get('/api/projects/:projectId/exists', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await fileSystemService.projectExists(projectId);
    res.json(result);
  } catch (error) {
    console.error('Error checking project existence:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// File System API Routes

// Get project file structure
app.get('/api/projects/:projectId/files', async (req, res) => {
  try {
    const { projectId } = req.params;
    const structure = await fileSystemService.getProjectStructure(projectId);
    res.json({ success: true, structure });
  } catch (error) {
    console.error('Error getting project structure:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new file
app.post('/api/projects/:projectId/files', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { filePath, content = '' } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path is required' });
    }

    // Validate filePath
    if (filePath.includes('..') || filePath.startsWith('/')) {
      return res.status(400).json({ success: false, error: 'Invalid file path' });
    }

    const result = await fileSystemService.createFile(projectId, filePath, content);
    res.json(result);
  } catch (error) {
    console.error('Error creating file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new folder
app.post('/api/projects/:projectId/folders', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { folderPath } = req.body;
    
    if (!folderPath) {
      return res.status(400).json({ success: false, error: 'Folder path is required' });
    }

    const result = await fileSystemService.createFolder(projectId, folderPath);
    res.json(result);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Read file content
app.get('/api/projects/:projectId/files/read', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path is required' });
    }

    const result = await fileSystemService.readFile(projectId, filePath);
    res.json(result);
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update file content
app.put('/api/projects/:projectId/files/update', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { path: filePath, content } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path is required' });
    }

    const result = await fileSystemService.updateFile(projectId, filePath, content);
    res.json(result);
  } catch (error) {
    console.error('Error updating file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete file or folder
app.delete('/api/projects/:projectId/items/delete', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { path: itemPath } = req.body;
    
    if (!itemPath) {
      return res.status(400).json({ success: false, error: 'Item path is required' });
    }

    const result = await fileSystemService.deleteItem(projectId, itemPath);
    res.json(result);
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rename file or folder
app.patch('/api/projects/:projectId/items/rename', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { oldPath, newPath } = req.body;
    
    if (!oldPath || !newPath) {
      return res.status(400).json({ success: false, error: 'Both old and new paths are required' });
    }

    const result = await fileSystemService.renameItem(projectId, oldPath, newPath);
    res.json(result);
  } catch (error) {
    console.error('Error renaming item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initialize project with default files
app.post('/api/projects/:projectId/initialize', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await fileSystemService.initializeProject(projectId);
    res.json(result);
  } catch (error) {
    console.error('Error initializing project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search files in project
app.get('/api/projects/:projectId/search', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { q: query } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    const result = await fileSystemService.searchFiles(projectId, query);
    res.json(result);
  } catch (error) {
    console.error('Error searching files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get file metadata
app.get('/api/projects/:projectId/metadata', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path is required' });
    }

    const result = await fileSystemService.getFileMetadata(projectId, filePath);
    res.json(result);
  } catch (error) {
    console.error('Error getting file metadata:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Copy file or folder
app.post('/api/projects/:projectId/copy', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { sourcePath, destinationPath } = req.body;
    
    if (!sourcePath || !destinationPath) {
      return res.status(400).json({ success: false, error: 'Both source and destination paths are required' });
    }

    const result = await fileSystemService.copyItem(projectId, sourcePath, destinationPath);
    res.json(result);
  } catch (error) {
    console.error('Error copying item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Move file or folder
app.post('/api/projects/:projectId/move', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { sourcePath, destinationPath } = req.body;
    
    if (!sourcePath || !destinationPath) {
      return res.status(400).json({ success: false, error: 'Both source and destination paths are required' });
    }

    const result = await fileSystemService.moveItem(projectId, sourcePath, destinationPath);
    res.json(result);
  } catch (error) {
    console.error('Error moving item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const server = app.listen(3001, () => {
  console.log("✅ Server running on http://localhost:3001");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("🔌 WebSocket client connected");

  ws.on("message", (message) => {
    const command = message.toString();

    if (command === "clear") {
      // No need to handle on backend — already managed in frontend
      return;
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        ws.send(stderr || error.message);
      } else {
        ws.send(stdout || "✔️ done");
      }
    });
  });

  ws.on("close", () => {
    console.log("❌ WebSocket client disconnected");
  });
});
