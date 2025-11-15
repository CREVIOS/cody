# MinIO Versioning Setup and Usage Guide

## Overview

This collaborative code editor now supports automatic file versioning using MinIO's built-in versioning feature. Every time a file is updated, MinIO automatically creates a new version while preserving all previous versions.

## Setup Instructions

### Step 1: Start MinIO Container

Ensure your MinIO container is running:

```bash
cd /home/user/cody
docker-compose up -d minio
```

Verify MinIO is running:
```bash
docker ps | grep minio
# Should show: cody-minio container running on ports 9000:9000 and 9001:9001
```

### Step 2: Enable Versioning on the 'projects' Bucket

You have **two options** to enable versioning:

#### Option A: Using the Node.js Script (Recommended)

```bash
cd SBackend
node scripts/enable-versioning.js
```

Expected output:
```
🔍 Checking if bucket 'projects' exists...
✅ Bucket 'projects' exists
🔄 Enabling versioning on bucket 'projects'...
✅ Versioning enabled successfully!
📋 Versioning status: { Status: 'Enabled' }
✨ Done!
```

#### Option B: Using MinIO Client (mc)

If you have MinIO client installed in the container:

```bash
docker exec -it cody-minio mc version enable myminio/projects
```

#### Option C: Using the API Endpoint

Start the SBackend server and call:

```bash
curl -X POST http://localhost:3001/api/versioning/enable
```

### Step 3: Verify Versioning is Enabled

Check versioning status:

```bash
curl http://localhost:3001/api/versioning/status
```

Expected response:
```json
{
  "success": true,
  "bucket": "projects",
  "status": "Enabled",
  "mfaDelete": "Disabled"
}
```

## How Versioning Works

### Automatic Version Creation

Once enabled, MinIO **automatically** creates a new version whenever a file is:
- Created
- Updated
- Deleted (creates a delete marker, actual data preserved)

**No code changes needed** - versioning happens transparently!

### Version IDs

Each version receives a unique, immutable UUID from MinIO:
```
Example: 3/L4kqtJlcpXroDTDmJ+rmSpXd3dIbrHY+MTRCxf3vjVBH40Nb
r7KEW6cdDU/zXeDc=
```

## API Endpoints

### 1. List All Versions of a File

```bash
GET /api/projects/:projectId/files/versions?path=<filePath>
```

**Example:**
```bash
curl "http://localhost:3001/api/projects/my-project/files/versions?path=src/app.ts"
```

**Response:**
```json
{
  "success": true,
  "file": "src/app.ts",
  "versions": [
    {
      "versionId": "3/L4kqtJlcpXroDTDmJ+rmSpXd3dIbrHY+...",
      "isLatest": true,
      "lastModified": "2025-01-15T10:30:00.000Z",
      "size": 1024,
      "etag": "d41d8cd98f00b204e9800998ecf8427e",
      "isDeleteMarker": false
    },
    {
      "versionId": "1/ABCkqtJlcpXroDTDmJ+rmSpXd3dIbrHY+...",
      "isLatest": false,
      "lastModified": "2025-01-15T09:15:00.000Z",
      "size": 956,
      "etag": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
      "isDeleteMarker": false
    }
  ],
  "totalVersions": 2
}
```

### 2. Get Content of a Specific Version

```bash
GET /api/projects/:projectId/files/version/:versionId?path=<filePath>
```

**Example:**
```bash
curl "http://localhost:3001/api/projects/my-project/files/version/3%2FL4kqtJlc...?path=src/app.ts"
```

**Response:**
```json
{
  "success": true,
  "content": "// File content from this version\nconsole.log('Hello');",
  "path": "src/app.ts",
  "versionId": "3/L4kqtJlc...",
  "metadata": {
    "size": 956,
    "lastModified": "2025-01-15T09:15:00.000Z",
    "etag": "a1b2c3d4..."
  }
}
```

### 3. Restore File to a Previous Version

```bash
POST /api/projects/:projectId/files/restore
Content-Type: application/json

{
  "path": "src/app.ts",
  "versionId": "1/ABCkqtJlcpXroDTDmJ+..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "File restored to version 1/ABCkqtJlc...",
  "path": "src/app.ts",
  "restoredFrom": "1/ABCkqtJlc..."
}
```

**Note:** Restore creates a NEW version with the old content. The version history is never modified.

### 4. Delete a Specific Version (Permanent)

```bash
DELETE /api/projects/:projectId/files/version/:versionId
Content-Type: application/json

{
  "path": "src/app.ts"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Version 1/ABCkqtJlc... deleted successfully",
  "path": "src/app.ts",
  "deletedVersion": "1/ABCkqtJlc..."
}
```

## Frontend Integration

### Using in FileSystemContext

The frontend can now retrieve version history:

```typescript
// Get all versions of current file
const response = await fetch(
  `${baseUrl}/api/projects/${projectId}/files/versions?path=${encodeURIComponent(filePath)}`
);
const { versions } = await response.json();

// Get specific version content
const versionResponse = await fetch(
  `${baseUrl}/api/projects/${projectId}/files/version/${versionId}?path=${encodeURIComponent(filePath)}`
);
const { content } = await versionResponse.json();

// Restore to previous version
await fetch(`${baseUrl}/api/projects/${projectId}/files/restore`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: filePath, versionId: versionId })
});
```

## Storage Considerations

### Storage Usage

- Each version stores the **complete file** (not diffs)
- Versioning increases storage usage
- Example: 10 versions of a 100KB file = 1MB total

### Lifecycle Management (Optional)

To automatically clean up old versions, you can configure lifecycle rules:

```javascript
// Example: Delete versions older than 30 days
const lifecycleConfig = {
  Rule: [{
    ID: 'expire-old-versions',
    Status: 'Enabled',
    NoncurrentVersionExpiration: {
      NoncurrentDays: 30
    }
  }]
};

await minioClient.setBucketLifecycle('projects', lifecycleConfig);
```

## Testing Versioning

### Manual Test

1. **Create a file:**
   ```bash
   curl -X POST http://localhost:3001/api/projects/test-project/files/create \
     -H "Content-Type: application/json" \
     -d '{"path":"test.txt","content":"Version 1"}'
   ```

2. **Update it (creates version 2):**
   ```bash
   curl -X PUT http://localhost:3001/api/projects/test-project/files/update \
     -H "Content-Type: application/json" \
     -d '{"path":"test.txt","content":"Version 2"}'
   ```

3. **Update again (creates version 3):**
   ```bash
   curl -X PUT http://localhost:3001/api/projects/test-project/files/update \
     -H "Content-Type: application/json" \
     -d '{"path":"test.txt","content":"Version 3"}'
   ```

4. **List all versions:**
   ```bash
   curl "http://localhost:3001/api/projects/test-project/files/versions?path=test.txt"
   ```

   Should show 3 versions!

5. **Get version 1 content:**
   ```bash
   # Use versionId from the list above
   curl "http://localhost:3001/api/projects/test-project/files/version/<version-id-here>?path=test.txt"
   ```

   Should return "Version 1"

## Troubleshooting

### Versioning Not Working

1. **Check if versioning is enabled:**
   ```bash
   curl http://localhost:3001/api/versioning/status
   ```

2. **Enable it if status is "Not Enabled":**
   ```bash
   curl -X POST http://localhost:3001/api/versioning/enable
   ```

### "Bucket not found" Error

Ensure the 'projects' bucket exists:
```bash
docker exec -it cody-minio mc ls myminio/
```

If missing, the bucket will be created automatically when SBackend starts.

### Version List is Empty

- Versioning only applies to NEW writes after it's enabled
- Existing files before enabling versioning will have only NULL version IDs
- Update a file to create its first proper version

## Design Patterns Used

Even with built-in versioning, this implementation demonstrates several design patterns:

1. **Facade Pattern**: FileSystemService provides a simplified interface to MinIO's complex versioning API

2. **Template Method Pattern**: Version operations (list, get, restore) follow a consistent structure

3. **Strategy Pattern** (future): Can implement different retention strategies

4. **Command Pattern**: Frontend restore operation can use RestoreVersionCommand for undo/redo

## Benefits of Built-in Versioning

✅ **Zero overhead** - No custom code to maintain version copies
✅ **Atomic operations** - Version creation is atomic with file update
✅ **Battle-tested** - MinIO's versioning is production-grade
✅ **S3-compatible** - Can migrate to AWS S3 later with no code changes
✅ **Delete protection** - Deleted files can be recovered
✅ **Immutable versions** - Once created, versions cannot be modified

## Next Steps

1. ✅ Enable versioning (done with this setup)
2. ⏭️ Create frontend UI component to show version history
3. ⏭️ Add RestoreVersionCommand to command pattern
4. ⏭️ Implement version comparison (diff view)
5. ⏭️ Add lifecycle policies for automatic cleanup

## References

- [MinIO Versioning Documentation](https://min.io/docs/minio/linux/administration/object-management/object-versioning.html)
- [MinIO JavaScript SDK API](https://min.io/docs/minio/linux/developers/javascript/API.html)
- [S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
