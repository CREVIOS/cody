#!/usr/bin/env node

/**
 * Script to enable MinIO versioning on the 'projects' bucket
 * Run this once to enable versioning: node scripts/enable-versioning.js
 */

const Minio = require('minio');

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

const bucketName = 'projects';

async function enableVersioning() {
  try {
    console.log(`🔍 Checking if bucket '${bucketName}' exists...`);

    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      console.log(`❌ Bucket '${bucketName}' does not exist. Creating it first...`);
      await minioClient.makeBucket(bucketName, 'us-east-1');
      console.log(`✅ Bucket '${bucketName}' created`);
    } else {
      console.log(`✅ Bucket '${bucketName}' exists`);
    }

    console.log(`\n🔄 Enabling versioning on bucket '${bucketName}'...`);

    // Enable versioning
    await minioClient.setBucketVersioning(bucketName, { Status: 'Enabled' });

    console.log(`✅ Versioning enabled successfully!`);

    // Verify versioning is enabled
    console.log(`\n🔍 Verifying versioning status...`);
    const versioningConfig = await minioClient.getBucketVersioning(bucketName);
    console.log(`📋 Versioning status:`, versioningConfig);

    if (versioningConfig.Status === 'Enabled') {
      console.log(`\n✅ SUCCESS! Versioning is now active on bucket '${bucketName}'`);
      console.log(`\n📝 What this means:`);
      console.log(`   - Every file update will create a new version automatically`);
      console.log(`   - Old versions are preserved and can be retrieved`);
      console.log(`   - Delete operations create delete markers (recoverable)`);
      console.log(`   - Each version has a unique version ID`);
    } else {
      console.log(`\n⚠️  Warning: Versioning status is '${versioningConfig.Status}'`);
    }

  } catch (error) {
    console.error(`\n❌ Error enabling versioning:`, error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
enableVersioning()
  .then(() => {
    console.log(`\n✨ Done!`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Fatal error:`, error);
    process.exit(1);
  });
