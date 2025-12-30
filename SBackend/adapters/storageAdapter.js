/**
 * StorageAdapter (Adapter contract)
 *
 * Domain-focused interface for project file storage. Implementations translate:
 *   (projectId, path) <-> underlying storage primitives (bucket/objectName, streams, etc.)
 *
 * Notes:
 * - All `path` values are *project-relative* paths (e.g. "src/index.js"), never include `${projectId}/`.
 * - Implementations may support optional methods (e.g. versioning status).
 */
class StorageAdapter {
  /**
   * Optional one-time initialization hook (e.g. ensure bucket exists).
   */
  async init() {
    // Optional
  }

  /**
   * Read file content.
   * @param {string} projectId
   * @param {string} filePath
   * @param {{ versionId?: string }=} options
   * @returns {Promise<string>}
   */
  async readFile(projectId, filePath, options) {
    throw new Error('Not implemented');
  }

  /**
   * Write file content (create or overwrite).
   * @param {string} projectId
   * @param {string} filePath
   * @param {string} content
   * @param {{ contentType?: string, meta?: Record<string, string> }=} options
   * @returns {Promise<{ versionId: (string|null), etag: (string|null), lastModified: Date, size: number }>}
   */
  async writeFile(projectId, filePath, content, options) {
    throw new Error('Not implemented');
  }

  /**
   * Delete a file or a prefix (folder).
   * @param {string} projectId
   * @param {string} pathOrPrefix
   * @param {{ purge?: boolean }=} options
   * @returns {Promise<{ deleted: number }>}
   */
  async deleteFile(projectId, pathOrPrefix, options) {
    throw new Error('Not implemented');
  }

  /**
   * List files under a prefix.
   * @param {string} projectId
   * @param {string} prefix
   * @param {{ recursive?: boolean, includeVersions?: boolean }=} options
   * @returns {Promise<Array<{ path: string, size: number, lastModified: Date, etag?: string, versionId?: string, isLatest?: boolean, isDeleteMarker?: boolean }>>}
   */
  async listFiles(projectId, prefix, options) {
    throw new Error('Not implemented');
  }

  /**
   * Stat a file (latest or specific version).
   * @param {string} projectId
   * @param {string} filePath
   * @param {{ versionId?: string }=} options
   * @returns {Promise<{ size: number, lastModified: Date, etag: (string|null), versionId: (string|null), metaData?: Record<string, string> }>}
   */
  async statFile(projectId, filePath, options) {
    throw new Error('Not implemented');
  }

  /**
   * Copy a file or a prefix to a new destination.
   * @param {string} projectId
   * @param {string} sourcePath
   * @param {string} destinationPath
   * @returns {Promise<void>}
   */
  async copyItem(projectId, sourcePath, destinationPath) {
    throw new Error('Not implemented');
  }

  /**
   * Rename a file or a prefix to a new destination.
   * @param {string} projectId
   * @param {string} oldPath
   * @param {string} newPath
   * @returns {Promise<void>}
   */
  async renameItem(projectId, oldPath, newPath) {
    throw new Error('Not implemented');
  }

  /**
   * List projects that exist in storage.
   * @returns {Promise<Array<{ id: string, name: string, lastModified: Date }>>}
   */
  async listProjects() {
    throw new Error('Not implemented');
  }

  /**
   * Delete all objects for a project.
   * @param {string} projectId
   * @param {{ purge?: boolean }=} options
   * @returns {Promise<{ deleted: number }>}
   */
  async deleteProject(projectId, options) {
    throw new Error('Not implemented');
  }

  /**
   * Check if a project exists.
   * @param {string} projectId
   * @returns {Promise<boolean>}
   */
  async projectExists(projectId) {
    throw new Error('Not implemented');
  }

  /**
   * List all versions for a file.
   * @param {string} projectId
   * @param {string} filePath
   * @returns {Promise<Array<{ versionId: string, isLatest: boolean, lastModified: Date, size: number, etag?: string, isDeleteMarker?: boolean }>>}
   */
  async getVersions(projectId, filePath) {
    throw new Error('Not implemented');
  }

  /**
   * Get content + metadata for a specific version.
   * @param {string} projectId
   * @param {string} filePath
   * @param {string} versionId
   * @returns {Promise<{ content: string, metadata: { size: number, lastModified: Date, etag?: string } }>}
   */
  async getVersion(projectId, filePath, versionId) {
    throw new Error('Not implemented');
  }

  /**
   * Restore a file to a version (typically creates a new latest version).
   * @param {string} projectId
   * @param {string} filePath
   * @param {string} versionId
   * @returns {Promise<void>}
   */
  async restoreVersion(projectId, filePath, versionId) {
    throw new Error('Not implemented');
  }

  /**
   * Permanently delete a specific version.
   * @param {string} projectId
   * @param {string} filePath
   * @param {string} versionId
   * @returns {Promise<void>}
   */
  async deleteVersion(projectId, filePath, versionId) {
    throw new Error('Not implemented');
  }

  /**
   * Optional: Get versioning status for the underlying bucket/container.
   */
  async getVersioningStatus() {
    throw new Error('Not implemented');
  }

  /**
   * Optional: Enable versioning for the underlying bucket/container.
   */
  async enableVersioning() {
    throw new Error('Not implemented');
  }
}

module.exports = StorageAdapter;

