const path = require('path');
const MinIOStorageAdapter = require('../adapters/minioStorageAdapter');

class FileSystemService {
  constructor(storageAdapter = new MinIOStorageAdapter()) {
    this.storage = storageAdapter;
    // Log which adapter is being used (Adapter Pattern verification)
    const adapterName = this.storage.constructor.name;
    console.log(`📦 [Adapter Pattern] FileSystemService initialized with: ${adapterName}`);
    console.log(`   Adapter type: ${adapterName === 'MinIOStorageAdapter' ? 'MinIO (Production)' : adapterName === 'MockStorageAdapter' ? 'Mock (Testing)' : 'Custom'}`);
    
    // Preserve old eager initialization behavior (best-effort, not awaited).
    if (typeof this.storage.init === 'function') {
      this.storage.init().catch((err) => {
        console.error('Error initializing storage adapter:', err);
      });
    }
  }

  async initializeBucket() {
    // Backwards-compatible method name: now delegates to adapter init().
    if (typeof this.storage.init !== 'function') {
      return;
    }
    await this.storage.init();
  }

  // Get project structure (file tree)
  async getProjectStructure(projectId) {
    try {
      // Adapter Pattern: Using storage adapter interface
      console.log(`📁 [Adapter] getProjectStructure called - Adapter: ${this.storage.constructor.name}, Project: ${projectId}`);
      const objects = await this.storage.listFiles(projectId, '', { recursive: true });

      // Convert flat structure to tree
      return this.buildFileTree(objects, `${projectId}/`);
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
      const relativePath = obj.path != null ? String(obj.path) : String(obj.name).replace(prefix, '');
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
      // Adapter Pattern: Using storage adapter interface
      console.log(`📝 [Adapter] createFile called - Adapter: ${this.storage.constructor.name}, Project: ${projectId}, Path: ${filePath}`);
      await this.storage.writeFile(projectId, filePath, content, { contentType: 'text/plain' });

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
      await this.storage.writeFile(projectId, `${folderPath}/.gitkeep`, '', { contentType: 'text/plain' });

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
      // Adapter Pattern: Using storage adapter interface
      console.log(`📖 [Adapter] readFile called - Adapter: ${this.storage.constructor.name}, Project: ${projectId}, Path: ${filePath}`);
      const content = await this.storage.readFile(projectId, filePath);

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
      // Adapter Pattern: Using storage adapter interface
      console.log(`✏️  [Adapter] updateFile called - Adapter: ${this.storage.constructor.name}, Project: ${projectId}, Path: ${filePath}`);
      const meta = await this.storage.writeFile(projectId, filePath, content, { contentType: 'text/plain' });

      return {
        success: true,
        message: 'File updated successfully',
        path: filePath,
        versionId: meta.versionId, // Phase 6: Return version ID (if adapter supports)
        size: meta.size,
        etag: meta.etag,
        lastModified: meta.lastModified
      };
    } catch (error) {
      console.error('Error updating file:', error);
      throw error;
    }
  }

  // Delete file or folder
  async deleteItem(projectId, itemPath, options = {}) {
    try {
      // Adapter Pattern: Using storage adapter interface
      console.log(`🗑️  [Adapter] deleteItem called - Adapter: ${this.storage.constructor.name}, Project: ${projectId}, Path: ${itemPath}`);
      await this.storage.deleteFile(projectId, itemPath, options);

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
      await this.storage.renameItem(projectId, oldPath, newPath);

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
      const objects = await this.storage.listFiles(projectId, '', { recursive: true });
      const matchingFiles = [];
      for (const obj of objects) {
        const relativePath = obj.path;
        
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
            const content = await this.storage.readFile(projectId, relativePath);
            
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
      const stat = await this.storage.statFile(projectId, filePath);
      
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
      await this.storage.copyItem(projectId, sourcePath, destinationPath);

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
      return {
        success: true,
        projects: await this.storage.listProjects()
      };
    } catch (error) {
      console.error('Error listing projects:', error);
      throw error;
    }
  }

  // Delete entire project
  async deleteProject(projectId, options = {}) {
    try {
      const result = await this.storage.deleteProject(projectId, options);

      return {
        success: true,
        message: `Project '${projectId}' deleted successfully`,
        deletedObjects: result.deleted
      };
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  }

  // Check if project exists
  async projectExists(projectId) {
    try {
      const exists = await this.storage.projectExists(projectId);
      return { success: true, exists };
    } catch (error) {
      console.error('Error checking project existence:', error);
      throw error;
    }
  }

  async ensureVersioningEnabled(options = {}) {
    const autoEnable = options && options.autoEnable === true;
    if (typeof this.storage.getVersioningStatus !== 'function') {
      return { enabled: false, status: null, reason: 'Versioning status unsupported by adapter' };
    }

    const status = await this.storage.getVersioningStatus();
    if (status && status.status === 'Enabled') {
      return { enabled: true, status };
    }

    if (autoEnable && typeof this.storage.enableVersioning === 'function') {
      await this.storage.enableVersioning();
      const updated = await this.storage.getVersioningStatus();
      if (updated && updated.status === 'Enabled') {
        return { enabled: true, status: updated, autoEnabled: true };
      }
    }

    const error = new Error(
      `Versioning is not enabled for bucket '${status?.bucket || 'unknown'}'. ` +
      `Run /api/versioning/enable or SBackend/scripts/enable-versioning.js to enable it.`
    );
    error.code = 'VERSIONING_DISABLED';
    error.details = status;
    throw error;
  }

  // ==================== VERSION MANAGEMENT ====================

  /**
   * List all versions of a specific file
   * Returns array of versions with metadata
   */
  async listFileVersions(projectId, filePath) {
    try {
      const versions = await this.storage.getVersions(projectId, filePath);

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
      const data = await this.storage.getVersion(projectId, filePath, versionId);

      return {
        success: true,
        content: data.content,
        path: filePath,
        versionId: versionId,
        metadata: {
          size: data.metadata.size,
          lastModified: data.metadata.lastModified,
          etag: data.metadata.etag
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
      await this.storage.restoreVersion(projectId, filePath, versionId);

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
      await this.storage.deleteVersion(projectId, filePath, versionId);

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
      try {
        const stat = await this.storage.statFile(projectId, filePath);
        
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
      return {
        success: true,
        ...(await this.storage.getVersioningStatus())
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
      return {
        success: true,
        message: `Versioning enabled`,
        ...(await this.storage.enableVersioning())
      };
    } catch (error) {
      console.error('Error enabling versioning:', error);
      throw error;
    }
  }
}

module.exports = FileSystemService;
