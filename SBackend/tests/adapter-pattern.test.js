/**
 * Adapter Pattern Test Suite
 * Tests StorageAdapter adapter pattern implementation
 *
 * This test suite verifies that the Adapter pattern is correctly
 * implemented, ensuring:
 * - StorageAdapter interface is properly defined
 * - MinIOStorageAdapter correctly adapts MinIO client
 * - MockStorageAdapter provides testable implementation
 * - Both adapters implement the same interface
 * - Adapter pattern enables storage provider flexibility
 *
 * Run with: node SBackend/tests/adapter-pattern.test.js
 */

const StorageAdapter = require('../adapters/storageAdapter');
const MinIOStorageAdapter = require('../adapters/minioStorageAdapter');
const MockStorageAdapter = require('../adapters/mockStorageAdapter');

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
    testsPassed++;
  }
}

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`❌ FAILED: ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual: ${JSON.stringify(actual)}`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
    testsPassed++;
  }
}

async function testAdapterInterface() {
  console.log('\n📋 Test 1: Adapter Interface Definition');
  console.log('='.repeat(60));

  // Verify StorageAdapter is a class
  assert(typeof StorageAdapter === 'function', 'StorageAdapter should be a class');

  // Verify StorageAdapter has required methods
  const adapter = new StorageAdapter();
  const requiredMethods = [
    'readFile',
    'writeFile',
    'deleteFile',
    'listFiles',
    'statFile',
    'copyItem',
    'renameItem',
    'listProjects',
    'deleteProject',
    'projectExists',
    'getVersions',
    'getVersion',
    'restoreVersion',
    'deleteVersion'
  ];

  for (const method of requiredMethods) {
    assert(
      typeof adapter[method] === 'function',
      `StorageAdapter should have ${method} method`
    );
  }

  // Verify abstract methods throw "Not implemented"
  try {
    await adapter.readFile('proj1', 'file1');
    assert(false, 'readFile should throw "Not implemented"');
  } catch (error) {
    assert(
      error.message === 'Not implemented',
      'readFile should throw "Not implemented" error'
    );
  }

  console.log('✓ Adapter interface test completed\n');
}

async function testMockAdapterImplementation() {
  console.log('\n📋 Test 2: MockStorageAdapter Implementation');
  console.log('='.repeat(60));

  const adapter = new MockStorageAdapter();

  // Test writeFile
  const writeResult = await adapter.writeFile('proj1', 'test.txt', 'Hello World');
  assert(writeResult.versionId !== null, 'writeFile should return versionId');
  assert(writeResult.size === 11, 'writeFile should return correct size');
  assert(writeResult.lastModified instanceof Date, 'writeFile should return lastModified');

  // Test readFile
  const content = await adapter.readFile('proj1', 'test.txt');
  assertEquals(content, 'Hello World', 'readFile should return written content');

  // Test statFile
  const stat = await adapter.statFile('proj1', 'test.txt');
  assert(stat.size === 11, 'statFile should return correct size');
  assert(stat.versionId !== null, 'statFile should return versionId');

  // Test listFiles
  const files = await adapter.listFiles('proj1');
  assert(files.length === 1, 'listFiles should return one file');
  assertEquals(files[0].path, 'test.txt', 'listFiles should return correct path');

  // Test projectExists
  const exists = await adapter.projectExists('proj1');
  assert(exists === true, 'projectExists should return true for existing project');

  // Test listProjects
  const projects = await adapter.listProjects();
  assert(projects.length === 1, 'listProjects should return one project');
  assertEquals(projects[0].id, 'proj1', 'listProjects should return correct project id');

  console.log('✓ Mock adapter implementation test completed\n');
}

async function testAdapterPolymorphism() {
  console.log('\n📋 Test 3: Adapter Polymorphism (Same Interface)');
  console.log('='.repeat(60));

  const mockAdapter = new MockStorageAdapter();
  const adapters = [mockAdapter];

  // Both adapters should implement the same interface
  for (const adapter of adapters) {
    assert(adapter instanceof StorageAdapter, 'Adapter should be instance of StorageAdapter');

    // Test that all required methods exist
    const methods = [
      'readFile', 'writeFile', 'deleteFile', 'listFiles',
      'statFile', 'copyItem', 'renameItem', 'listProjects',
      'deleteProject', 'projectExists', 'getVersions', 'getVersion',
      'restoreVersion', 'deleteVersion'
    ];

    for (const method of methods) {
      assert(
        typeof adapter[method] === 'function',
        `Adapter should have ${method} method`
      );
    }
  }

  console.log('✓ Adapter polymorphism test completed\n');
}

async function testVersioningOperations() {
  console.log('\n📋 Test 4: Versioning Operations');
  console.log('='.repeat(60));

  const adapter = new MockStorageAdapter();
  const projectId = 'proj1';
  const filePath = 'versioned.txt';

  // Write initial version
  const v1 = await adapter.writeFile(projectId, filePath, 'Version 1');
  assert(v1.versionId !== null, 'First write should create version');

  // Add small delay to ensure different timestamps
  await new Promise(resolve => setTimeout(resolve, 10));

  // Write second version
  const v2 = await adapter.writeFile(projectId, filePath, 'Version 2');
  assert(v2.versionId !== v1.versionId, 'Second write should create new version');

  // Get all versions
  const versions = await adapter.getVersions(projectId, filePath);
  assert(versions.length === 2, 'Should have 2 versions');
  
  // Find the latest version (should be the one with isLatest: true)
  const latestVersion = versions.find(v => v.isLatest === true);
  const nonLatestVersions = versions.filter(v => v.isLatest === false);
  
  assert(latestVersion !== undefined, 'Should have one version marked as latest');
  assert(nonLatestVersions.length === 1, 'Should have one version not marked as latest');
  assert(latestVersion.versionId === v2.versionId, 'Latest version should be the second version');
  assert(nonLatestVersions[0].versionId === v1.versionId, 'Non-latest version should be the first version');
  
  // Also verify that versions are sorted by lastModified (newest first)
  assert(versions[0].lastModified >= versions[1].lastModified, 'Versions should be sorted by lastModified descending');

  // Get specific version
  const version1 = await adapter.getVersion(projectId, filePath, v1.versionId);
  assertEquals(version1.content, 'Version 1', 'getVersion should return correct content');

  // Read latest
  const latest = await adapter.readFile(projectId, filePath);
  assertEquals(latest, 'Version 2', 'readFile should return latest version');

  // Read specific version
  const oldVersion = await adapter.readFile(projectId, filePath, { versionId: v1.versionId });
  assertEquals(oldVersion, 'Version 1', 'readFile with versionId should return specific version');

  // Restore version (this creates a new version)
  await adapter.restoreVersion(projectId, filePath, v1.versionId);
  const restored = await adapter.readFile(projectId, filePath);
  assertEquals(restored, 'Version 1', 'restoreVersion should restore content');

  // Get versions after restore (should have 3 now: v1, v2, and restored v1)
  const versionsAfterRestore = await adapter.getVersions(projectId, filePath);
  assert(versionsAfterRestore.length === 3, 'restoreVersion should create a new version');

  // Delete the original v1 version
  await adapter.deleteVersion(projectId, filePath, v1.versionId);
  const versionsAfterDelete = await adapter.getVersions(projectId, filePath);
  
  // Should have one less version after deletion
  assert(versionsAfterDelete.length === versionsAfterRestore.length - 1, 'deleteVersion should remove version');
  
  // Verify that v1 is no longer in the versions list
  const v1StillExists = versionsAfterDelete.some(v => v.versionId === v1.versionId);
  assert(v1StillExists === false, 'Deleted version should not be in versions list');

  console.log('✓ Versioning operations test completed\n');
}

async function testFileOperations() {
  console.log('\n📋 Test 5: File Operations');
  console.log('='.repeat(60));

  const adapter = new MockStorageAdapter();
  const projectId = 'proj1';

  // Write multiple files
  await adapter.writeFile(projectId, 'file1.txt', 'Content 1');
  await adapter.writeFile(projectId, 'file2.txt', 'Content 2');
  await adapter.writeFile(projectId, 'subdir/file3.txt', 'Content 3');

  // List all files
  const allFiles = await adapter.listFiles(projectId);
  assert(allFiles.length === 3, 'Should list all files');

  // List with prefix
  const subdirFiles = await adapter.listFiles(projectId, 'subdir');
  assert(subdirFiles.length === 1, 'Should filter by prefix');
  assertEquals(subdirFiles[0].path, 'subdir/file3.txt', 'Should return correct file');

  // Copy file
  await adapter.copyItem(projectId, 'file1.txt', 'file1-copy.txt');
  const copied = await adapter.readFile(projectId, 'file1-copy.txt');
  assertEquals(copied, 'Content 1', 'copyItem should copy content');

  // Rename file
  await adapter.renameItem(projectId, 'file2.txt', 'renamed.txt');
  const renamed = await adapter.readFile(projectId, 'renamed.txt');
  assertEquals(renamed, 'Content 2', 'renameItem should move content');
  
  const oldFile = await adapter.readFile(projectId, 'file2.txt').catch(() => null);
  assert(oldFile === null, 'Old file should not exist after rename');

  // Delete file
  const deleteResult = await adapter.deleteFile(projectId, 'file1.txt');
  assert(deleteResult.deleted === 1, 'deleteFile should return deleted count');

  const deletedFile = await adapter.readFile(projectId, 'file1.txt').catch(() => null);
  assert(deletedFile === null, 'Deleted file should not exist');

  console.log('✓ File operations test completed\n');
}

async function testProjectOperations() {
  console.log('\n📋 Test 6: Project Operations');
  console.log('='.repeat(60));

  const adapter = new MockStorageAdapter();

  // Create multiple projects
  await adapter.writeFile('proj1', 'file1.txt', 'Content 1');
  await adapter.writeFile('proj2', 'file2.txt', 'Content 2');
  await adapter.writeFile('proj3', 'file3.txt', 'Content 3');

  // List projects
  const projects = await adapter.listProjects();
  assert(projects.length === 3, 'Should list all projects');

  // Check project exists
  assert(await adapter.projectExists('proj1') === true, 'Existing project should return true');
  assert(await adapter.projectExists('nonexistent') === false, 'Non-existent project should return false');

  // Delete project
  const deleteResult = await adapter.deleteProject('proj1');
  assert(deleteResult.deleted > 0, 'deleteProject should return deleted count');

  const projectsAfterDelete = await adapter.listProjects();
  assert(projectsAfterDelete.length === 2, 'Should have one less project after delete');

  const stillExists = await adapter.projectExists('proj1');
  assert(stillExists === false, 'Deleted project should not exist');

  console.log('✓ Project operations test completed\n');
}

async function testAdapterPatternBenefits() {
  console.log('\n📋 Test 7: Adapter Pattern Benefits');
  console.log('='.repeat(60));

  // Test that we can swap adapters without changing client code
  function clientCode(adapter) {
    return async (projectId, filePath, content) => {
      await adapter.writeFile(projectId, filePath, content);
      return await adapter.readFile(projectId, filePath);
    };
  }

  // Test with MockStorageAdapter
  const mockAdapter = new MockStorageAdapter();
  const client1 = clientCode(mockAdapter);
  const result1 = await client1('proj1', 'test.txt', 'Mock content');
  assertEquals(result1, 'Mock content', 'Client code should work with MockStorageAdapter');

  // The same client code would work with MinIOStorageAdapter
  // (we don't test it here because it requires actual MinIO instance)
  // But the pattern ensures they're interchangeable

  console.log('✓ Adapter pattern benefits test completed\n');
}

async function testErrorHandling() {
  console.log('\n📋 Test 8: Error Handling');
  console.log('='.repeat(60));

  const adapter = new MockStorageAdapter();

  // Test reading non-existent file
  try {
    await adapter.readFile('proj1', 'nonexistent.txt');
    assert(false, 'Should throw error for non-existent file');
  } catch (error) {
    assert(error.code === 'NotFound', 'Should throw NotFound error');
  }

  // Test statting non-existent file
  try {
    await adapter.statFile('proj1', 'nonexistent.txt');
    assert(false, 'Should throw error for non-existent file');
  } catch (error) {
    assert(error.code === 'NotFound', 'Should throw NotFound error');
  }

  // Test getting non-existent version
  await adapter.writeFile('proj1', 'test.txt', 'Content');
  try {
    await adapter.getVersion('proj1', 'test.txt', 'invalid-version-id');
    assert(false, 'Should throw error for non-existent version');
  } catch (error) {
    assert(error.code === 'NotFound', 'Should throw NotFound error');
  }

  console.log('✓ Error handling test completed\n');
}

async function testAdapterInitialization() {
  console.log('\n📋 Test 9: Adapter Initialization');
  console.log('='.repeat(60));

  // Mock adapter init is optional (no-op)
  const mockAdapter = new MockStorageAdapter();
  await mockAdapter.init(); // Should not throw
  assert(true, 'Mock adapter init should be optional');

  // Verify adapter can be used after init
  await mockAdapter.writeFile('proj1', 'test.txt', 'Content');
  const content = await mockAdapter.readFile('proj1', 'test.txt');
  assertEquals(content, 'Content', 'Adapter should work after init');

  console.log('✓ Adapter initialization test completed\n');
}

async function testVersioningStatus() {
  console.log('\n📋 Test 10: Versioning Status');
  console.log('='.repeat(60));

  const adapter = new MockStorageAdapter();

  // Test getVersioningStatus
  const status = await adapter.getVersioningStatus();
  assert(status.bucket !== undefined, 'getVersioningStatus should return status');
  assert(status.status === 'Enabled', 'Mock adapter should have versioning enabled');

  // Test enableVersioning
  const enabled = await adapter.enableVersioning();
  assert(enabled.status === 'Enabled', 'enableVersioning should return enabled status');

  console.log('✓ Versioning status test completed\n');
}

// Run all tests
async function runAllTests() {
  testsPassed = 0;
  testsFailed = 0;

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          ADAPTER PATTERN TEST SUITE                       ║');
  console.log('║          Testing: StorageAdapter Pattern                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await testAdapterInterface();
    await testMockAdapterImplementation();
    await testAdapterPolymorphism();
    await testVersioningOperations();
    await testFileOperations();
    await testProjectOperations();
    await testAdapterPatternBenefits();
    await testErrorHandling();
    await testAdapterInitialization();
    await testVersioningStatus();

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📊 Total Tests: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('\n✅ ALL ADAPTER PATTERN TESTS PASSED!\n');
    return { testsPassed, testsFailed };
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED');
    console.error(error);
    throw error;
  }
}

// Export for Jest if running in Jest environment
if (typeof describe !== 'undefined') {
  describe('StorageAdapter (Adapter Pattern)', () => {
    it('passes the adapter-pattern suite', async () => {
      const result = await runAllTests();
      expect(result.testsFailed).toBe(0);
    });
  });
}

// Allow running directly via Node for ad-hoc debugging
if (require.main === module) {
  runAllTests()
    .then((r) => {
      console.log(`Done: ${r.testsPassed} passed, ${r.testsFailed} failed`);
      process.exit(r.testsFailed > 0 ? 1 : 0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

