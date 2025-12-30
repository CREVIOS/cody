const StorageAdapter = require('./storageAdapter');

function makeEtag(content) {
  // Not a real etag; good enough for tests.
  return `mock-${Buffer.from(content ?? '', 'utf8').length}-${Date.now()}`;
}

class MockStorageAdapter extends StorageAdapter {
  constructor() {
    super();
    /** @type {Map<string, Map<string, { content: string, versions: Array<any> }>>} */
    this.projects = new Map();
  }

  _getProject(projectId) {
    if (!this.projects.has(projectId)) {
      this.projects.set(projectId, new Map());
    }
    return this.projects.get(projectId);
  }

  _getEntry(projectId, filePath) {
    const proj = this._getProject(projectId);
    if (!proj.has(filePath)) {
      proj.set(filePath, { content: '', versions: [] });
    }
    return proj.get(filePath);
  }

  async readFile(projectId, filePath, options = {}) {
    const proj = this.projects.get(projectId);
    if (!proj || !proj.has(filePath)) {
      const err = new Error('Not Found');
      err.code = 'NotFound';
      throw err;
    }
    const entry = proj.get(filePath);
    if (!options.versionId) {
      return entry.content;
    }
    const v = entry.versions.find((vv) => vv.versionId === options.versionId);
    if (!v) {
      const err = new Error('Not Found');
      err.code = 'NotFound';
      throw err;
    }
    return v.content;
  }

  async writeFile(projectId, filePath, content) {
    const entry = this._getEntry(projectId, filePath);
    const now = new Date();

    const versionId = String(entry.versions.length + 1);
    const etag = makeEtag(content);
    const size = Buffer.from(content ?? '', 'utf8').length;

    // Mark previous latest as not latest
    entry.versions.forEach((v) => {
      v.isLatest = false;
    });
    entry.versions.push({
      versionId,
      isLatest: true,
      lastModified: now,
      size,
      etag,
      isDeleteMarker: false,
      content: content ?? ''
    });

    entry.content = content ?? '';

    return { versionId, etag, lastModified: now, size };
  }

  async deleteFile(projectId, pathOrPrefix, _options = {}) {
    const proj = this.projects.get(projectId);
    if (!proj) return { deleted: 0 };

    const keys = Array.from(proj.keys()).filter(
      (p) => p === pathOrPrefix || p.startsWith(`${pathOrPrefix}/`)
    );
    keys.forEach((k) => proj.delete(k));
    return { deleted: keys.length };
  }

  async listFiles(projectId, prefix = '', options = {}) {
    const proj = this.projects.get(projectId);
    if (!proj) return [];

    const out = [];
    const recursive = options.recursive !== false;
    const normalizedPrefix = prefix ? String(prefix).replace(/^\/+/, '') : '';

    for (const [p, entry] of proj.entries()) {
      if (normalizedPrefix) {
        if (p === normalizedPrefix) {
          // include exact match
        } else if (recursive && p.startsWith(`${normalizedPrefix}/`)) {
          // include children
        } else {
          continue;
        }
      }

      const size = Buffer.from(entry.content ?? '', 'utf8').length;
      out.push({
        path: p,
        size,
        lastModified: entry.versions.length ? entry.versions[entry.versions.length - 1].lastModified : new Date(),
        etag: entry.versions.length ? entry.versions[entry.versions.length - 1].etag : makeEtag(entry.content),
        ...(options.includeVersions
          ? {
              versionId: entry.versions.length ? entry.versions[entry.versions.length - 1].versionId : undefined,
              isLatest: true,
              isDeleteMarker: false
            }
          : {})
      });
    }

    return out;
  }

  async statFile(projectId, filePath, options = {}) {
    const proj = this.projects.get(projectId);
    if (!proj || !proj.has(filePath)) {
      const err = new Error('Not Found');
      err.code = 'NotFound';
      throw err;
    }
    const entry = proj.get(filePath);
    if (!options.versionId) {
      const last = entry.versions[entry.versions.length - 1];
      return {
        size: Buffer.from(entry.content ?? '', 'utf8').length,
        lastModified: last ? last.lastModified : new Date(),
        etag: last ? last.etag : null,
        versionId: last ? last.versionId : null,
        metaData: {}
      };
    }
    const v = entry.versions.find((vv) => vv.versionId === options.versionId);
    if (!v) {
      const err = new Error('Not Found');
      err.code = 'NotFound';
      throw err;
    }
    return {
      size: v.size,
      lastModified: v.lastModified,
      etag: v.etag || null,
      versionId: v.versionId || null,
      metaData: {}
    };
  }

  async copyItem(projectId, sourcePath, destinationPath) {
    const proj = this.projects.get(projectId);
    if (!proj) throw new Error('Source item not found');

    const keys = Array.from(proj.keys()).filter(
      (p) => p === sourcePath || p.startsWith(`${sourcePath}/`)
    );
    if (keys.length === 0) throw new Error('Source item not found');

    for (const oldKey of keys) {
      const suffix = oldKey.replace(sourcePath, '');
      const newKey = `${destinationPath}${suffix}`;
      const content = await this.readFile(projectId, oldKey);
      await this.writeFile(projectId, newKey, content);
    }
  }

  async renameItem(projectId, oldPath, newPath) {
    await this.copyItem(projectId, oldPath, newPath);
    await this.deleteFile(projectId, oldPath);
  }

  async listProjects() {
    return Array.from(this.projects.keys()).map((projectId) => ({
      id: projectId,
      name: projectId,
      lastModified: new Date()
    }));
  }

  async deleteProject(projectId, _options = {}) {
    const proj = this.projects.get(projectId);
    const deleted = proj ? proj.size : 0;
    this.projects.delete(projectId);
    return { deleted };
  }

  async projectExists(projectId) {
    const proj = this.projects.get(projectId);
    return !!(proj && proj.size > 0);
  }

  async getVersions(projectId, filePath) {
    const proj = this.projects.get(projectId);
    if (!proj || !proj.has(filePath)) return [];
    const entry = proj.get(filePath);
    const versions = entry.versions.map((v) => ({
      versionId: v.versionId,
      isLatest: !!v.isLatest,
      lastModified: v.lastModified,
      size: v.size,
      etag: v.etag,
      isDeleteMarker: !!v.isDeleteMarker
    }));
    versions.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    return versions;
  }

  async getVersion(projectId, filePath, versionId) {
    const content = await this.readFile(projectId, filePath, { versionId });
    const stat = await this.statFile(projectId, filePath, { versionId });
    return {
      content,
      metadata: { size: stat.size, lastModified: stat.lastModified, etag: stat.etag }
    };
  }

  async restoreVersion(projectId, filePath, versionId) {
    const v = await this.getVersion(projectId, filePath, versionId);
    await this.writeFile(projectId, filePath, v.content);
  }

  async deleteVersion(projectId, filePath, versionId) {
    const proj = this.projects.get(projectId);
    if (!proj || !proj.has(filePath)) return;
    const entry = proj.get(filePath);
    entry.versions = entry.versions.filter((v) => v.versionId !== versionId);
    // Recompute latest flag
    entry.versions.forEach((v) => {
      v.isLatest = false;
    });
    const last = entry.versions[entry.versions.length - 1];
    if (last) {
      last.isLatest = true;
      entry.content = last.content;
    } else {
      // no versions left => delete file
      proj.delete(filePath);
    }
  }

  async getVersioningStatus() {
    return { bucket: 'mock', status: 'Enabled', mfaDelete: 'Disabled' };
  }

  async enableVersioning() {
    return { bucket: 'mock', status: 'Enabled' };
  }
}

module.exports = MockStorageAdapter;

