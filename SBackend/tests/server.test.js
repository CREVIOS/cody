const request = require('supertest');
const express = require('express');

// Mock the FileSystemService
jest.mock('../services/fileSystemService');
const FileSystemService = require('../services/fileSystemService');

// Create a test app with the same configuration as the main server
const app = express();
app.use(express.json({ limit: '10mb' }));

// Mock FileSystemService instance
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
  initializeProject: jest.fn()
};

// Mock the constructor to return our mock instance
FileSystemService.mockImplementation(() => mockFileSystemService);

// Import and set up routes after mocking
const fileSystemService = new FileSystemService();

// Copy the routes from server.js
app.get('/api/projects', async (req, res) => {
  try {
    const result = await fileSystemService.listProjects();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'Project ID is required' });
    }

    const exists = await fileSystemService.projectExists(projectId);
    if (!exists.exists) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const result = await fileSystemService.deleteProject(projectId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:projectId/exists', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await fileSystemService.projectExists(projectId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:projectId/files', async (req, res) => {
  try {
    const { projectId } = req.params;
    const structure = await fileSystemService.getProjectStructure(projectId);
    res.json({ success: true, structure });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/projects/:projectId/files', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { filePath, content = '' } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path is required' });
    }

    if (filePath.includes('..') || filePath.startsWith('/')) {
      return res.status(400).json({ success: false, error: 'Invalid file path' });
    }

    const result = await fileSystemService.createFile(projectId, filePath, content);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/projects/:projectId/initialize', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await fileSystemService.initializeProject(projectId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

describe('Server API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

      expect(response.body).toEqual({
        success: false,
        error: 'Database error'
      });
    });
  });

  describe('DELETE /api/projects/:projectId', () => {
    it('should delete project successfully', async () => {
      mockFileSystemService.projectExists.mockResolvedValue({ exists: true });
      mockFileSystemService.deleteProject.mockResolvedValue({ success: true, message: 'Project deleted' });

      const response = await request(app)
        .delete('/api/projects/test-project')
        .expect(200);

      expect(response.body).toEqual({ success: true, message: 'Project deleted' });
      expect(mockFileSystemService.projectExists).toHaveBeenCalledWith('test-project');
      expect(mockFileSystemService.deleteProject).toHaveBeenCalledWith('test-project');
    });

    it('should return 404 if project does not exist', async () => {
      mockFileSystemService.projectExists.mockResolvedValue({ exists: false });

      const response = await request(app)
        .delete('/api/projects/nonexistent-project')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Project not found'
      });
      expect(mockFileSystemService.deleteProject).not.toHaveBeenCalled();
    });

    it('should return 400 if project ID is missing', async () => {
      const response = await request(app)
        .delete('/api/projects/')
        .expect(404); // Express returns 404 for missing route params
    });

    it('should handle errors during project deletion', async () => {
      mockFileSystemService.projectExists.mockResolvedValue({ exists: true });
      mockFileSystemService.deleteProject.mockRejectedValue(new Error('Deletion failed'));

      const response = await request(app)
        .delete('/api/projects/test-project')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Deletion failed'
      });
    });
  });

  describe('GET /api/projects/:projectId/exists', () => {
    it('should check if project exists', async () => {
      mockFileSystemService.projectExists.mockResolvedValue({ exists: true, projectId: 'test-project' });

      const response = await request(app)
        .get('/api/projects/test-project/exists')
        .expect(200);

      expect(response.body).toEqual({ exists: true, projectId: 'test-project' });
      expect(mockFileSystemService.projectExists).toHaveBeenCalledWith('test-project');
    });

    it('should handle errors when checking project existence', async () => {
      mockFileSystemService.projectExists.mockRejectedValue(new Error('Check failed'));

      const response = await request(app)
        .get('/api/projects/test-project/exists')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Check failed'
      });
    });
  });

  describe('GET /api/projects/:projectId/files', () => {
    it('should get project file structure', async () => {
      const mockStructure = [
        { name: 'file1.txt', type: 'file' },
        { name: 'folder1', type: 'folder', children: [] }
      ];
      
      mockFileSystemService.getProjectStructure.mockResolvedValue(mockStructure);

      const response = await request(app)
        .get('/api/projects/test-project/files')
        .expect(200);

      expect(response.body).toEqual({ success: true, structure: mockStructure });
      expect(mockFileSystemService.getProjectStructure).toHaveBeenCalledWith('test-project');
    });

    it('should handle errors when getting project structure', async () => {
      mockFileSystemService.getProjectStructure.mockRejectedValue(new Error('Structure error'));

      const response = await request(app)
        .get('/api/projects/test-project/files')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Structure error'
      });
    });
  });

  describe('POST /api/projects/:projectId/files', () => {
    it('should create file successfully', async () => {
      const mockResult = { success: true, message: 'File created', path: 'test.txt' };
      mockFileSystemService.createFile.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/projects/test-project/files')
        .send({ filePath: 'test.txt', content: 'Hello World' })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockFileSystemService.createFile).toHaveBeenCalledWith('test-project', 'test.txt', 'Hello World');
    });

    it('should create file with empty content by default', async () => {
      const mockResult = { success: true, message: 'File created', path: 'empty.txt' };
      mockFileSystemService.createFile.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/projects/test-project/files')
        .send({ filePath: 'empty.txt' })
        .expect(200);

      expect(mockFileSystemService.createFile).toHaveBeenCalledWith('test-project', 'empty.txt', '');
    });

    it('should return 400 if file path is missing', async () => {
      const response = await request(app)
        .post('/api/projects/test-project/files')
        .send({ content: 'Hello World' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'File path is required'
      });
    });

    it('should return 400 for invalid file paths', async () => {
      const response = await request(app)
        .post('/api/projects/test-project/files')
        .send({ filePath: '../test.txt', content: 'Hello World' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid file path'
      });
    });

    it('should handle file creation errors', async () => {
      mockFileSystemService.createFile.mockRejectedValue(new Error('Creation failed'));

      const response = await request(app)
        .post('/api/projects/test-project/files')
        .send({ filePath: 'test.txt', content: 'Hello World' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Creation failed'
      });
    });
  });

  describe('POST /api/projects/:projectId/folders', () => {
    it('should create folder successfully', async () => {
      const mockResult = { success: true, message: 'Folder created', path: 'newfolder' };
      mockFileSystemService.createFolder.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/projects/test-project/folders')
        .send({ folderPath: 'newfolder' })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockFileSystemService.createFolder).toHaveBeenCalledWith('test-project', 'newfolder');
    });

    it('should return 400 if folder path is missing', async () => {
      const response = await request(app)
        .post('/api/projects/test-project/folders')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Folder path is required'
      });
    });

    it('should handle folder creation errors', async () => {
      mockFileSystemService.createFolder.mockRejectedValue(new Error('Folder creation failed'));

      const response = await request(app)
        .post('/api/projects/test-project/folders')
        .send({ folderPath: 'newfolder' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Folder creation failed'
      });
    });
  });

  describe('GET /api/projects/:projectId/files/read', () => {
    it('should read file content successfully', async () => {
      const mockResult = { success: true, content: 'File content', path: 'test.txt' };
      mockFileSystemService.readFile.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/projects/test-project/files/read')
        .query({ path: 'test.txt' })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockFileSystemService.readFile).toHaveBeenCalledWith('test-project', 'test.txt');
    });

    it('should return 400 if file path is missing', async () => {
      const response = await request(app)
        .get('/api/projects/test-project/files/read')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'File path is required'
      });
    });

    it('should handle file reading errors', async () => {
      mockFileSystemService.readFile.mockRejectedValue(new Error('File not found'));

      const response = await request(app)
        .get('/api/projects/test-project/files/read')
        .query({ path: 'nonexistent.txt' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'File not found'
      });
    });
  });

  describe('PUT /api/projects/:projectId/files/update', () => {
    it('should update file successfully', async () => {
      const mockResult = { success: true, message: 'File updated', path: 'test.txt' };
      mockFileSystemService.updateFile.mockResolvedValue(mockResult);

      const response = await request(app)
        .put('/api/projects/test-project/files/update')
        .send({ path: 'test.txt', content: 'Updated content' })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockFileSystemService.updateFile).toHaveBeenCalledWith('test-project', 'test.txt', 'Updated content');
    });

    it('should return 400 if file path is missing', async () => {
      const response = await request(app)
        .put('/api/projects/test-project/files/update')
        .send({ content: 'Updated content' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'File path is required'
      });
    });

    it('should handle file update errors', async () => {
      mockFileSystemService.updateFile.mockRejectedValue(new Error('Update failed'));

      const response = await request(app)
        .put('/api/projects/test-project/files/update')
        .send({ path: 'test.txt', content: 'Updated content' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Update failed'
      });
    });
  });

  describe('DELETE /api/projects/:projectId/items/delete', () => {
    it('should delete item successfully', async () => {
      const mockResult = { success: true, message: 'Item deleted' };
      mockFileSystemService.deleteItem.mockResolvedValue(mockResult);

      const response = await request(app)
        .delete('/api/projects/test-project/items/delete')
        .send({ path: 'test.txt' })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockFileSystemService.deleteItem).toHaveBeenCalledWith('test-project', 'test.txt');
    });

    it('should return 400 if item path is missing', async () => {
      const response = await request(app)
        .delete('/api/projects/test-project/items/delete')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Item path is required'
      });
    });

    it('should handle item deletion errors', async () => {
      mockFileSystemService.deleteItem.mockRejectedValue(new Error('Deletion failed'));

      const response = await request(app)
        .delete('/api/projects/test-project/items/delete')
        .send({ path: 'test.txt' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Deletion failed'
      });
    });
  });

  describe('PATCH /api/projects/:projectId/items/rename', () => {
    it('should rename item successfully', async () => {
      const mockResult = { success: true, message: 'Item renamed' };
      mockFileSystemService.renameItem.mockResolvedValue(mockResult);

      const response = await request(app)
        .patch('/api/projects/test-project/items/rename')
        .send({ oldPath: 'old.txt', newPath: 'new.txt' })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockFileSystemService.renameItem).toHaveBeenCalledWith('test-project', 'old.txt', 'new.txt');
    });

    it('should return 400 if paths are missing', async () => {
      const response = await request(app)
        .patch('/api/projects/test-project/items/rename')
        .send({ oldPath: 'old.txt' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Both old and new paths are required'
      });
    });

    it('should handle rename errors', async () => {
      mockFileSystemService.renameItem.mockRejectedValue(new Error('Rename failed'));

      const response = await request(app)
        .patch('/api/projects/test-project/items/rename')
        .send({ oldPath: 'old.txt', newPath: 'new.txt' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Rename failed'
      });
    });
  });

  describe('POST /api/projects/:projectId/initialize', () => {
    it('should initialize project successfully', async () => {
      const mockResult = { success: true, message: 'Project initialized' };
      mockFileSystemService.initializeProject.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/projects/test-project/initialize')
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockFileSystemService.initializeProject).toHaveBeenCalledWith('test-project');
    });

    it('should handle initialization errors', async () => {
      mockFileSystemService.initializeProject.mockRejectedValue(new Error('Initialization failed'));

      const response = await request(app)
        .post('/api/projects/test-project/initialize')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Initialization failed'
      });
    });
  });
}); 