const Minio = require('minio');
const path = require('path');
const fs = require('fs-extra');

class FileSystemService {
  constructor() {
    // Initialize MinIO client
    this.minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT) || 9000,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
    });
    
    this.bucketName = 'projects';
    this.initializeBucket();
  }

  async initializeBucket() {
    try {
      const bucketExists = await this.minioClient.bucketExists(this.bucketName);
      if (!bucketExists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        console.log(`Bucket '${this.bucketName}' created successfully`);
      } else {
        console.log(`Bucket '${this.bucketName}' already exists`);
      }
    } catch (error) {
      console.error('Error initializing bucket:', error);
    }
  }

  // Get project structure (file tree)
  async getProjectStructure(projectId) {
    try {
      const prefix = `${projectId}/`;
      const objectsStream = this.minioClient.listObjects(this.bucketName, prefix, true);
      
      const objects = [];
      for await (const obj of objectsStream) {
        objects.push(obj);
      }

      // Convert flat structure to tree
      return this.buildFileTree(objects, prefix);
    } catch (error) {
      console.error('Error getting project structure:', error);
      throw error;
    }
  }

  // Build hierarchical file tree from flat object list
  buildFileTree(objects, prefix) {
    const tree = {
      name: 'root',
      type: 'folder',
      path: '',
      children: []
    };

    // Process all objects first to build the complete folder structure
    objects.forEach(obj => {
      const relativePath = obj.name.replace(prefix, '');
      if (!relativePath) return; // Skip empty paths
      
      const pathParts = relativePath.split('/');
      let currentNode = tree;

      pathParts.forEach((part, index) => {
        if (!part) return; // Skip empty parts
        
        const isFile = index === pathParts.length - 1 && obj.size !== undefined;
        const existingChild = currentNode.children.find(child => child.name === part);

        if (existingChild) {
          currentNode = existingChild;
        } else {
          const newNode = {
            name: part,
            type: isFile ? 'file' : 'folder',
            path: pathParts.slice(0, index + 1).join('/'),
            size: isFile ? obj.size : undefined,
            lastModified: obj.lastModified,
            children: isFile ? undefined : []
          };
          
          currentNode.children.push(newNode);
          currentNode = newNode;
        }
      });
    });

    // Now filter out .gitkeep files from the final structure
    const filterGitkeepFiles = (node) => {
      if (node.type === 'file' && node.name === '.gitkeep') {
        return false;
      }
      if (node.children) {
        node.children = node.children.filter(filterGitkeepFiles);
      }
      return true;
    };

    const filteredTree = tree.children.filter(filterGitkeepFiles);
    return filteredTree;
  }

  // Create a new file
  async createFile(projectId, filePath, content = '') {
    try {
      const objectName = `${projectId}/${filePath}`;
      const buffer = Buffer.from(content, 'utf8');
      
      await this.minioClient.putObject(this.bucketName, objectName, buffer, buffer.length, {
        'Content-Type': 'text/plain'
      });

      return {
        success: true,
        message: 'File created successfully',
        path: filePath
      };
    } catch (error) {
      console.error('Error creating file:', error);
      throw error;
    }
  }

  // Create a new folder (by creating a .gitkeep file inside it)
  async createFolder(projectId, folderPath) {
    try {
      const objectName = `${projectId}/${folderPath}/.gitkeep`;
      await this.minioClient.putObject(this.bucketName, objectName, Buffer.from(''), 0);

      return {
        success: true,
        message: 'Folder created successfully',
        path: folderPath
      };
    } catch (error) {
      console.error('Error creating folder:', error);
      throw error;
    }
  }

  // Read file content
  async readFile(projectId, filePath) {
    try {
      const objectName = `${projectId}/${filePath}`;
      const stream = await this.minioClient.getObject(this.bucketName, objectName);
      
      let content = '';
      for await (const chunk of stream) {
        content += chunk.toString();
      }

      return {
        success: true,
        content: content,
        path: filePath
      };
    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  }

  // Update file content
  async updateFile(projectId, filePath, content) {
    try {
      const objectName = `${projectId}/${filePath}`;
      const buffer = Buffer.from(content, 'utf8');
      
      await this.minioClient.putObject(this.bucketName, objectName, buffer, buffer.length, {
        'Content-Type': 'text/plain'
      });

      return {
        success: true,
        message: 'File updated successfully',
        path: filePath
      };
    } catch (error) {
      console.error('Error updating file:', error);
      throw error;
    }
  }

  // Delete file or folder
  async deleteItem(projectId, itemPath) {
    try {
      const prefix = `${projectId}/${itemPath}`;
      
      // Check if it's a folder by listing objects with the prefix
      const objectsStream = this.minioClient.listObjects(this.bucketName, prefix, true);
      const objectsToDelete = [];
      
      for await (const obj of objectsStream) {
        objectsToDelete.push(obj.name);
      }

      if (objectsToDelete.length === 0) {
        // Try deleting as a single file
        await this.minioClient.removeObject(this.bucketName, prefix);
      } else {
        // Delete multiple objects (folder)
        await this.minioClient.removeObjects(this.bucketName, objectsToDelete);
      }

      return {
        success: true,
        message: 'Item deleted successfully',
        path: itemPath
      };
    } catch (error) {
      console.error('Error deleting item:', error);
      throw error;
    }
  }

  // Rename file or folder
  async renameItem(projectId, oldPath, newPath) {
    try {
      const oldPrefix = `${projectId}/${oldPath}`;
      const newPrefix = `${projectId}/${newPath}`;

      // List all objects that start with the old path
      const objectsStream = this.minioClient.listObjects(this.bucketName, oldPrefix, true);
      const objectsToMove = [];
      
      for await (const obj of objectsStream) {
        objectsToMove.push(obj.name);
      }

      if (objectsToMove.length === 0) {
        throw new Error('Item not found');
      }

      // Copy objects to new location and delete old ones
      for (const oldObjectName of objectsToMove) {
        const relativePath = oldObjectName.replace(oldPrefix, '');
        const newObjectName = newPrefix + relativePath;

        // Copy object to new location
        await this.minioClient.copyObject(
          this.bucketName, 
          newObjectName, 
          `/${this.bucketName}/${oldObjectName}`
        );
      }

      // Delete old objects
      await this.minioClient.removeObjects(this.bucketName, objectsToMove);

      return {
        success: true,
        message: 'Item renamed successfully',
        oldPath: oldPath,
        newPath: newPath
      };
    } catch (error) {
      console.error('Error renaming item:', error);
      throw error;
    }
  }

  // Initialize a new project with default files
  async initializeProject(projectId) {
    try {
      const defaultFiles = [
        { path: 'index.js', content: '// Welcome to your new project!\nconsole.log("Hello, World!");' },
        { path: 'package.json', content: JSON.stringify({
          name: projectId.toLowerCase().replace(/\s+/g, '-'),
          version: '1.0.0',
          description: '',
          main: 'index.js',
          scripts: {
            start: 'node index.js'
          }
        }, null, 2) },
        { path: 'README.md', content: `# ${projectId}\n\nWelcome to your new project!` }
      ];

      for (const file of defaultFiles) {
        await this.createFile(projectId, file.path, file.content);
      }

      return {
        success: true,
        message: 'Project initialized successfully',
        projectId: projectId
      };
    } catch (error) {
      console.error('Error initializing project:', error);
      throw error;
    }
  }

  // Search files in project (enhanced with content search)
  async searchFiles(projectId, query) {
    try {
      const prefix = `${projectId}/`;
      const objectsStream = this.minioClient.listObjects(this.bucketName, prefix, true);
      
      const matchingFiles = [];
      for await (const obj of objectsStream) {
        const relativePath = obj.name.replace(prefix, '');
        
        // Skip .gitkeep files
        if (relativePath.endsWith('.gitkeep')) {
          continue;
        }
        
        if (relativePath.toLowerCase().includes(query.toLowerCase())) {
          matchingFiles.push({
            name: path.basename(relativePath),
            path: relativePath,
            size: obj.size,
            lastModified: obj.lastModified,
            type: 'file' // Changed from 'filename' to 'file'
          });
        }
        
        // Also search file content for text files
        if (this.isTextFile(relativePath) && obj.size < 1024 * 1024) { // Only search files < 1MB
          try {
            const stream = await this.minioClient.getObject(this.bucketName, obj.name);
            let content = '';
            for await (const chunk of stream) {
              content += chunk.toString();
            }
            
            if (content.toLowerCase().includes(query.toLowerCase())) {
              const lines = content.split('\n');
              const matchingLines = [];
              lines.forEach((line, index) => {
                if (line.toLowerCase().includes(query.toLowerCase())) {
                  matchingLines.push({
                    lineNumber: index + 1,
                    content: line.trim(),
                    startColumn: line.toLowerCase().indexOf(query.toLowerCase())
                  });
                }
              });
              
              if (matchingLines.length > 0) {
                matchingFiles.push({
                  name: path.basename(relativePath),
                  path: relativePath,
                  size: obj.size,
                  lastModified: obj.lastModified,
                  type: 'content',
                  matches: matchingLines
                });
              }
            }
          } catch (contentError) {
            // Ignore content search errors
          }
        }
      }

      return {
        success: true,
        results: matchingFiles,
        query: query
      };
    } catch (error) {
      console.error('Error searching files:', error);
      throw error;
    }
  }

  // Helper method to determine if a file is a text file
  isTextFile(filePath) {
    const textExtensions = [
      'txt', 'md', 'js', 'jsx', 'ts', 'tsx', 'json', 'html', 'css', 'scss',
      'py', 'java', 'cpp', 'c', 'go', 'rs', 'php', 'rb', 'sh', 'yml', 'yaml',
      'xml', 'sql', 'log', 'config', 'conf', 'ini', 'env'
    ];
    const extension = path.extname(filePath).slice(1).toLowerCase();
    return textExtensions.includes(extension);
  }

  // Get file metadata
  async getFileMetadata(projectId, filePath) {
    try {
      const objectName = `${projectId}/${filePath}`;
      const stat = await this.minioClient.statObject(this.bucketName, objectName);
      
      return {
        success: true,
        metadata: {
          size: stat.size,
          lastModified: stat.lastModified,
          etag: stat.etag,
          metaData: stat.metaData
        }
      };
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw error;
    }
  }

  // Copy file or folder
  async copyItem(projectId, sourcePath, destinationPath) {
    try {
      const sourcePrefix = `${projectId}/${sourcePath}`;
      const destPrefix = `${projectId}/${destinationPath}`;

      // List all objects that start with the source path
      const objectsStream = this.minioClient.listObjects(this.bucketName, sourcePrefix, true);
      const objectsToCopy = [];
      
      for await (const obj of objectsStream) {
        objectsToCopy.push(obj.name);
      }

      if (objectsToCopy.length === 0) {
        throw new Error('Source item not found');
      }

      // Copy objects to new location
      for (const sourceObjectName of objectsToCopy) {
        const relativePath = sourceObjectName.replace(sourcePrefix, '');
        const destObjectName = destPrefix + relativePath;

        await this.minioClient.copyObject(
          this.bucketName, 
          destObjectName, 
          `/${this.bucketName}/${sourceObjectName}`
        );
      }

      return {
        success: true,
        message: 'Item copied successfully',
        sourcePath: sourcePath,
        destinationPath: destinationPath
      };
    } catch (error) {
      console.error('Error copying item:', error);
      throw error;
    }
  }

  // Move file or folder
  async moveItem(projectId, sourcePath, destinationPath) {
    try {
      // First copy the item
      await this.copyItem(projectId, sourcePath, destinationPath);
      
      // Then delete the source
      await this.deleteItem(projectId, sourcePath);

      return {
        success: true,
        message: 'Item moved successfully',
        sourcePath: sourcePath,
        destinationPath: destinationPath
      };
    } catch (error) {
      console.error('Error moving item:', error);
      throw error;
    }
  }

  // List all projects
  async listProjects() {
    try {
      const objectsStream = this.minioClient.listObjects(this.bucketName, '', false);
      const projects = new Set();
      
      for await (const obj of objectsStream) {
        // For non-recursive listing, MinIO returns objects with 'prefix' property for directories
        // and 'name' property for files at the root level
        const objectName = obj.prefix || obj.name;
        
        if (objectName && typeof objectName === 'string') {
          // Extract project ID from object name (first part before '/')
          let projectId;
          if (obj.prefix) {
            // For prefixes, remove the trailing slash
            projectId = objectName.replace(/\/$/, '');
          } else {
            // For files, get the first part before '/'
            projectId = objectName.split('/')[0];
          }
          
          if (projectId && projectId.trim() !== '') {
            projects.add(projectId);
          }
        }
      }

      const projectList = Array.from(projects).map(projectId => ({
        id: projectId,
        name: projectId,
        lastModified: new Date() // We could enhance this to get actual last modified date
      }));

      return {
        success: true,
        projects: projectList
      };
    } catch (error) {
      console.error('Error listing projects:', error);
      throw error;
    }
  }

  // Delete entire project
  async deleteProject(projectId) {
    try {
      const prefix = `${projectId}/`;
      const objectsStream = this.minioClient.listObjects(this.bucketName, prefix, true);
      
      const objectsToDelete = [];
      for await (const obj of objectsStream) {
        objectsToDelete.push(obj.name);
      }

      if (objectsToDelete.length > 0) {
        await this.minioClient.removeObjects(this.bucketName, objectsToDelete);
      }

      return {
        success: true,
        message: `Project '${projectId}' deleted successfully`,
        deletedObjects: objectsToDelete.length
      };
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  }

  // Check if project exists
  async projectExists(projectId) {
    try {
      const prefix = `${projectId}/`;
      const objectsStream = this.minioClient.listObjects(this.bucketName, prefix, false);
      
      for await (const obj of objectsStream) {
        // If we find any object with this prefix, project exists
        return { success: true, exists: true };
      }
      
      return { success: true, exists: false };
    } catch (error) {
      console.error('Error checking project existence:', error);
      throw error;
    }
  }
}

module.exports = FileSystemService;
