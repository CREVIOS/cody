const Minio = require('minio');
const path = require('path');

class FileSystemService {
  constructor() {
    // Initialize MinIO client
    this.minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10), // default matches docker-compose host mapping 9000:9000
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
        const region = process.env.MINIO_REGION || 'us-east-1';
        await this.minioClient.makeBucket(this.bucketName, region);
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

  // Update file content (Phase 6: Returns version info for versioning)
  async updateFile(projectId, filePath, content) {
    try {
      const objectName = `${projectId}/${filePath}`;
      const buffer = Buffer.from(content, 'utf8');
      
      // Save to MinIO (creates new version if versioning is enabled)
      await this.minioClient.putObject(this.bucketName, objectName, buffer, buffer.length, {
        'Content-Type': 'text/plain'
      });

      // Get the new version ID after save
      let versionId = null;
      let etag = null;
      let lastModified = null;
      
      try {
        // Wait a small amount for MinIO to process the version
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const stat = await this.minioClient.statObject(this.bucketName, objectName);
        versionId = stat.versionId || null;
        etag = stat.etag || null;
        lastModified = stat.lastModified || new Date();
      } catch (statError) {
        console.warn('Could not get version info after save:', statError.message);
        // Continue anyway - save was successful
      }

      return {
        success: true,
        message: 'File updated successfully',
        path: filePath,
        versionId: versionId, // Phase 6: Return MinIO version ID
        size: buffer.length,
        etag: etag,
        lastModified: lastModified
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

  // ==================== VERSION MANAGEMENT ====================

  /**
   * List all versions of a specific file
   * Returns array of versions with metadata
   */
  async listFileVersions(projectId, filePath) {
    try {
      const objectName = `${projectId}/${filePath}`;
      const versions = [];

      // List all versions of the object
      const stream = this.minioClient.listObjects(
        this.bucketName,
        objectName,
        false,
        { IncludeVersion: true }
      );

      for await (const obj of stream) {
        // Skip if this is just a prefix/folder
        if (obj.name !== objectName) {
          continue;
        }

        versions.push({
          versionId: obj.versionId,
          isLatest: obj.isLatest || false,
          lastModified: obj.lastModified,
          size: obj.size,
          etag: obj.etag,
          isDeleteMarker: obj.isDeleteMarker || false
        });
      }

      // Sort by lastModified descending (newest first)
      versions.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

      return {
        success: true,
        file: filePath,
        versions: versions,
        totalVersions: versions.length
      };
    } catch (error) {
      console.error('Error listing file versions:', error);
      throw error;
    }
  }

  /**
   * Get content of a specific version of a file
   */
  async getFileVersion(projectId, filePath, versionId) {
    try {
      const objectName = `${projectId}/${filePath}`;

      // Get the specific version from MinIO
      const stream = await this.minioClient.getObject(
        this.bucketName,
        objectName,
        { versionId: versionId }
      );

      let content = '';
      for await (const chunk of stream) {
        content += chunk.toString();
      }

      // Get metadata for this version
      const stat = await this.minioClient.statObject(
        this.bucketName,
        objectName,
        { versionId: versionId }
      );

      return {
        success: true,
        content: content,
        path: filePath,
        versionId: versionId,
        metadata: {
          size: stat.size,
          lastModified: stat.lastModified,
          etag: stat.etag
        }
      };
    } catch (error) {
      console.error(`Error getting file version ${versionId}:`, error);
      throw error;
    }
  }

  /**
   * Restore a file to a specific version
   * This creates a new version with the content of the old version
   */
  async restoreFileVersion(projectId, filePath, versionId) {
    try {
      const objectName = `${projectId}/${filePath}`;

      // 1. Get the content of the version to restore
      const versionData = await this.getFileVersion(projectId, filePath, versionId);

      // 2. Upload it as the current version (creates a new version)
      const buffer = Buffer.from(versionData.content, 'utf8');
      await this.minioClient.putObject(
        this.bucketName,
        objectName,
        buffer,
        buffer.length,
        {
          'Content-Type': 'text/plain',
          'x-amz-meta-restored-from': versionId, // Mark that this was restored
          'x-amz-meta-restored-at': new Date().toISOString()
        }
      );

      return {
        success: true,
        message: `File restored to version ${versionId}`,
        path: filePath,
        restoredFrom: versionId
      };
    } catch (error) {
      console.error(`Error restoring file to version ${versionId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a specific version of a file
   * Note: This permanently deletes that version
   */
  async deleteFileVersion(projectId, filePath, versionId) {
    try {
      const objectName = `${projectId}/${filePath}`;

      await this.minioClient.removeObject(
        this.bucketName,
        objectName,
        { versionId: versionId }
      );

      return {
        success: true,
        message: `Version ${versionId} deleted successfully`,
        path: filePath,
        deletedVersion: versionId
      };
    } catch (error) {
      console.error(`Error deleting version ${versionId}:`, error);
      throw error;
    }
  }

  /**
   * Get the current (latest) version ID of a file
   * Returns null if file doesn't exist or has no versions
   * OPTIMIZED: Uses statObject instead of listing all versions for better performance
   */
  async getCurrentVersionId(projectId, filePath) {
    try {
      const objectName = `${projectId}/${filePath}`;
      
      // Use statObject to get current version directly (much faster than listing all versions)
      try {
        const stat = await this.minioClient.statObject(this.bucketName, objectName);
        
        // statObject returns the current version's metadata including versionId
        if (stat.versionId) {
          return {
            success: true,
            versionId: stat.versionId,
            exists: true,
            lastModified: stat.lastModified
          };
        }
        
        // If no versionId in stat, file exists but versioning might not be enabled or it's a new file
        return {
          success: true,
          versionId: null,
          exists: true,
          lastModified: stat.lastModified
        };
      } catch (statError) {
        // If statObject fails, file doesn't exist
        if (statError.code === 'NotFound' || statError.message?.includes('Not Found')) {
          return {
            success: true,
            versionId: null,
            exists: false
          };
        }
        
        // For other errors, try fallback to listFileVersions (slower but more reliable)
        console.warn('statObject failed, falling back to listFileVersions:', statError.message);
        const versionsResult = await this.listFileVersions(projectId, filePath);
        if (!versionsResult.success || !versionsResult.versions || versionsResult.versions.length === 0) {
          return {
            success: true,
            versionId: null,
            exists: false
          };
        }

        // Find the latest version (not a delete marker)
        const latestVersion = versionsResult.versions.find(v => v.isLatest && !v.isDeleteMarker);
        if (!latestVersion) {
          return {
            success: true,
            versionId: null,
            exists: false
          };
        }

        return {
          success: true,
          versionId: latestVersion.versionId,
          exists: true,
          lastModified: latestVersion.lastModified
        };
      }
    } catch (error) {
      console.error('Error getting current version ID:', error);
      throw error;
    }
  }

  /**
   * Get versioning status for the bucket
   */
  async getVersioningStatus() {
    try {
      const config = await this.minioClient.getBucketVersioning(this.bucketName);
      return {
        success: true,
        bucket: this.bucketName,
        status: config.Status || 'Not Enabled',
        mfaDelete: config.MFADelete || 'Disabled'
      };
    } catch (error) {
      console.error('Error getting versioning status:', error);
      throw error;
    }
  }

  /**
   * Enable versioning on the bucket (should be run once during setup)
   */
  async enableVersioning() {
    try {
      await this.minioClient.setBucketVersioning(this.bucketName, {
        Status: 'Enabled'
      });

      return {
        success: true,
        message: `Versioning enabled on bucket '${this.bucketName}'`,
        bucket: this.bucketName
      };
    } catch (error) {
      console.error('Error enabling versioning:', error);
      throw error;
    }
  }
}

module.exports = FileSystemService;