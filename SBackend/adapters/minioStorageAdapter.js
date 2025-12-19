const Minio = require('minio');
const StorageAdapter = require('./storageAdapter');

class MinIOStorageAdapter extends StorageAdapter {
  constructor(options = {}) {
    super();

    this.bucketName = options.bucketName || 'projects';
    this.minioClient =
      options.minioClient ||
      new Minio.Client({
        endPoint: process.env.MINIO_ENDPOINT || 'localhost',
        port: parseInt(process.env.MINIO_PORT || '9000', 10), // default matches docker-compose host mapping 9000:9000
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
      });
  }

  _objectName(projectId, filePath) {
    if (!filePath) {
      return `${projectId}/`;
    }
    const normalized = String(filePath).replace(/^\/+/, '');
    return `${projectId}/${normalized}`;
  }

  async init() {
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
      // Preserve old behavior: initialization errors should not crash startup synchronously.
      console.error('Error initializing bucket:', error);
    }
  }

  async readFile(projectId, filePath, options = {}) {
    const objectName = this._objectName(projectId, filePath);
    const getOpts = options.versionId ? { versionId: options.versionId } : undefined;
    const stream = await this.minioClient.getObject(this.bucketName, objectName, getOpts);

    let content = '';
    for await (const chunk of stream) {
      content += chunk.toString();
    }
    return content;
  }

  async writeFile(projectId, filePath, content, options = {}) {
    const objectName = this._objectName(projectId, filePath);
    const buffer = Buffer.from(content ?? '', 'utf8');
    const meta = {
      ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
      ...(options.meta || {})
    };

    await this.minioClient.putObject(this.bucketName, objectName, buffer, buffer.length, meta);

    // Attempt to stat right after write to surface version ID / metadata (best-effort).
    let versionId = null;
    let etag = null;
    let lastModified = new Date();
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const stat = await this.minioClient.statObject(this.bucketName, objectName);
      versionId = stat.versionId || null;
      etag = stat.etag || null;
      lastModified = stat.lastModified || lastModified;
    } catch (statError) {
      // Non-fatal: write succeeded but stat failed.
      console.warn('Could not get version info after write:', statError.message);
    }

    return { versionId, etag, lastModified, size: buffer.length };
  }

  async deleteFile(projectId, pathOrPrefix) {
    const prefix = this._objectName(projectId, pathOrPrefix);
    const stream = this.minioClient.listObjects(this.bucketName, prefix, true);

    const objectNames = [];
    for await (const obj of stream) {
      if (obj && obj.name) {
        objectNames.push(obj.name);
      }
    }

    if (objectNames.length === 0) {
      await this.minioClient.removeObject(this.bucketName, prefix);
      return { deleted: 1 };
    }

    await this.minioClient.removeObjects(this.bucketName, objectNames);
    return { deleted: objectNames.length };
  }

  async listFiles(projectId, prefix = '', options = {}) {
    const fullPrefix = this._objectName(projectId, prefix);
    const recursive = options.recursive !== false;
    const listOpts = options.includeVersions ? { IncludeVersion: true } : undefined;
    const stream = this.minioClient.listObjects(this.bucketName, fullPrefix, recursive, listOpts);

    const results = [];
    for await (const obj of stream) {
      if (!obj || typeof obj.name !== 'string') continue;

      // Normalize to project-relative path
      const rel = obj.name.startsWith(`${projectId}/`) ? obj.name.slice(`${projectId}/`.length) : obj.name;
      if (!rel) continue;

      results.push({
        path: rel,
        size: obj.size,
        lastModified: obj.lastModified,
        etag: obj.etag,
        versionId: obj.versionId,
        isLatest: obj.isLatest || false,
        isDeleteMarker: obj.isDeleteMarker || false
      });
    }

    return results;
  }

  async statFile(projectId, filePath, options = {}) {
    const objectName = this._objectName(projectId, filePath);
    const statOpts = options.versionId ? { versionId: options.versionId } : undefined;
    const stat = await this.minioClient.statObject(this.bucketName, objectName, statOpts);
    return {
      size: stat.size,
      lastModified: stat.lastModified,
      etag: stat.etag || null,
      versionId: stat.versionId || null,
      metaData: stat.metaData
    };
  }

  async copyItem(projectId, sourcePath, destinationPath) {
    const sourcePrefix = this._objectName(projectId, sourcePath);
    const destPrefix = this._objectName(projectId, destinationPath);

    const stream = this.minioClient.listObjects(this.bucketName, sourcePrefix, true);
    const objectNames = [];
    for await (const obj of stream) {
      if (obj && obj.name) {
        objectNames.push(obj.name);
      }
    }

    if (objectNames.length === 0) {
      throw new Error('Source item not found');
    }

    for (const oldObjectName of objectNames) {
      const relativeSuffix = oldObjectName.replace(sourcePrefix, '');
      const newObjectName = destPrefix + relativeSuffix;
      await this.minioClient.copyObject(
        this.bucketName,
        newObjectName,
        `/${this.bucketName}/${oldObjectName}`
      );
    }
  }

  async renameItem(projectId, oldPath, newPath) {
    await this.copyItem(projectId, oldPath, newPath);
    await this.deleteFile(projectId, oldPath);
  }

  async listProjects() {
    const stream = this.minioClient.listObjects(this.bucketName, '', false);
    const projects = new Set();

    for await (const obj of stream) {
      const objectName = obj.prefix || obj.name;
      if (!objectName || typeof objectName !== 'string') continue;

      let projectId;
      if (obj.prefix) {
        projectId = objectName.replace(/\/$/, '');
      } else {
        projectId = objectName.split('/')[0];
      }

      if (projectId && projectId.trim() !== '') {
        projects.add(projectId);
      }
    }

    return Array.from(projects).map((projectId) => ({
      id: projectId,
      name: projectId,
      lastModified: new Date()
    }));
  }

  async deleteProject(projectId) {
    const prefix = this._objectName(projectId, '');
    const stream = this.minioClient.listObjects(this.bucketName, prefix, true);
    const objectNames = [];
    for await (const obj of stream) {
      if (obj && obj.name) objectNames.push(obj.name);
    }

    if (objectNames.length > 0) {
      await this.minioClient.removeObjects(this.bucketName, objectNames);
    }

    return { deleted: objectNames.length };
  }

  async projectExists(projectId) {
    const prefix = this._objectName(projectId, '');
    const stream = this.minioClient.listObjects(this.bucketName, prefix, false);
    for await (const _obj of stream) {
      return true;
    }
    return false;
  }

  async getVersions(projectId, filePath) {
    const objectName = this._objectName(projectId, filePath);
    const versions = [];

    const stream = this.minioClient.listObjects(this.bucketName, objectName, false, { IncludeVersion: true });
    for await (const obj of stream) {
      if (!obj || obj.name !== objectName) continue;
      versions.push({
        versionId: obj.versionId,
        isLatest: obj.isLatest || false,
        lastModified: obj.lastModified,
        size: obj.size,
        etag: obj.etag,
        isDeleteMarker: obj.isDeleteMarker || false
      });
    }

    versions.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    return versions;
  }

  async getVersion(projectId, filePath, versionId) {
    const content = await this.readFile(projectId, filePath, { versionId });
    const stat = await this.statFile(projectId, filePath, { versionId });
    return {
      content,
      metadata: {
        size: stat.size,
        lastModified: stat.lastModified,
        etag: stat.etag
      }
    };
  }

  async restoreVersion(projectId, filePath, versionId) {
    const versionData = await this.getVersion(projectId, filePath, versionId);
    await this.writeFile(projectId, filePath, versionData.content, {
      contentType: 'text/plain',
      meta: {
        'x-amz-meta-restored-from': versionId,
        'x-amz-meta-restored-at': new Date().toISOString()
      }
    });
  }

  async deleteVersion(projectId, filePath, versionId) {
    const objectName = this._objectName(projectId, filePath);
    await this.minioClient.removeObject(this.bucketName, objectName, { versionId });
  }

  async getVersioningStatus() {
    const config = await this.minioClient.getBucketVersioning(this.bucketName);
    return {
      bucket: this.bucketName,
      status: config.Status || 'Not Enabled',
      mfaDelete: config.MFADelete || 'Disabled'
    };
  }

  async enableVersioning() {
    await this.minioClient.setBucketVersioning(this.bucketName, { Status: 'Enabled' });
    return {
      bucket: this.bucketName,
      status: 'Enabled'
    };
  }
}

module.exports = MinIOStorageAdapter;


