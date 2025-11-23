/**
 * Strategy Pattern Test Suite
 * Tests Version Retention Strategies implementation
 *
 * Run with: node SBackend/tests/strategy-pattern.test.js
 */

const {
  KeepRecentVersionsStrategy,
  TimeBasedRetentionStrategy,
  TaggedVersionsStrategy,
  VersionRetentionManager
} = require('../services/versionRetentionStrategies');

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
  if (actual !== expected) {
    console.error(`❌ FAILED: ${message}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual: ${actual}`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
    testsPassed++;
  }
}

// Mock FileSystemService
class MockFileSystemService {
  constructor() {
    this.deletedVersions = [];
  }

  async listFileVersions(projectId, filePath) {
    // Return mock versions
    return {
      success: true,
      versions: this.getMockVersions()
    };
  }

  async deleteFileVersion(projectId, filePath, versionId) {
    this.deletedVersions.push(versionId);
    return { success: true };
  }

  getMockVersions() {
    const now = new Date();
    return [
      {
        versionId: 'v1',
        isLatest: true,
        lastModified: new Date(now - 1000 * 60 * 10), // 10 min ago
        size: 100,
        etag: 'etag1',
        isDeleteMarker: false
      },
      {
        versionId: 'v2',
        isLatest: false,
        lastModified: new Date(now - 1000 * 60 * 60), // 1 hour ago
        size: 95,
        etag: 'etag2',
        isDeleteMarker: false
      },
      {
        versionId: 'v3',
        isLatest: false,
        lastModified: new Date(now - 1000 * 60 * 60 * 5), // 5 hours ago
        size: 90,
        etag: 'etag3',
        isDeleteMarker: false
      },
      {
        versionId: 'v4',
        isLatest: false,
        lastModified: new Date(now - 1000 * 60 * 60 * 24 * 2), // 2 days ago
        size: 85,
        etag: 'etag4',
        isDeleteMarker: false
      },
      {
        versionId: 'v5',
        isLatest: false,
        lastModified: new Date(now - 1000 * 60 * 60 * 24 * 3), // 3 days ago
        size: 80,
        etag: 'etag5',
        isDeleteMarker: false
      },
      {
        versionId: 'v6',
        isLatest: false,
        lastModified: new Date(now - 1000 * 60 * 60 * 24 * 10), // 10 days ago
        size: 75,
        etag: 'etag6',
        isDeleteMarker: false
      },
      {
        versionId: 'v7',
        isLatest: false,
        lastModified: new Date(now - 1000 * 60 * 60 * 24 * 40), // 40 days ago
        size: 70,
        etag: 'etag7',
        isDeleteMarker: false
      }
    ];
  }

  getDeletedVersions() {
    return this.deletedVersions;
  }

  resetDeletedVersions() {
    this.deletedVersions = [];
  }
}

// Tests
async function testKeepRecentVersionsStrategy() {
  console.log('\n📋 Test 1: KeepRecentVersionsStrategy');
  console.log('='.repeat(60));

  const strategy = new KeepRecentVersionsStrategy(3);

  assertEquals(strategy.getName(), 'KeepRecent(3)', 'Strategy name should include max versions');

  const mockService = new MockFileSystemService();
  const versions = mockService.getMockVersions();

  const toKeep = strategy.filterVersionsToKeep(versions);

  // Should keep 3 most recent versions
  assertEquals(toKeep.length, 3, 'Should keep exactly 3 versions');

  // Latest should always be kept
  assert(toKeep.some(v => v.versionId === 'v1'), 'Latest version (v1) should be kept');

  // Should keep most recent
  assert(toKeep.some(v => v.versionId === 'v2'), 'Second most recent (v2) should be kept');
  assert(toKeep.some(v => v.versionId === 'v3'), 'Third most recent (v3) should be kept');

  // Should not keep older versions
  assert(!toKeep.some(v => v.versionId === 'v7'), 'Oldest version (v7) should not be kept');

  console.log('Kept versions:', toKeep.map(v => v.versionId));
  console.log('✓ KeepRecentVersionsStrategy test completed\n');
}

async function testTimeBasedRetentionStrategy() {
  console.log('\n📋 Test 2: TimeBasedRetentionStrategy');
  console.log('='.repeat(60));

  const strategy = new TimeBasedRetentionStrategy({
    keepAllHours: 24,
    keepDailyDays: 7,
    keepWeeklyDays: 30
  });

  assertEquals(
    strategy.getName(),
    'TimeBased(24h/7d/30d)',
    'Strategy name should show retention periods'
  );

  const mockService = new MockFileSystemService();
  const versions = mockService.getMockVersions();

  const toKeep = strategy.filterVersionsToKeep(versions);

  // Latest should always be kept
  assert(toKeep.some(v => v.versionId === 'v1'), 'Latest version should be kept');

  // All versions within 24 hours should be kept
  assert(toKeep.some(v => v.versionId === 'v2'), 'Version from 1h ago should be kept (within 24h)');
  assert(toKeep.some(v => v.versionId === 'v3'), 'Version from 5h ago should be kept (within 24h)');

  // Version from 40 days ago should not be kept (older than 30 days)
  assert(!toKeep.some(v => v.versionId === 'v7'), 'Version from 40 days ago should not be kept');

  console.log('Kept versions:', toKeep.map(v => v.versionId));
  console.log('✓ TimeBasedRetentionStrategy test completed\n');
}

async function testTaggedVersionsStrategy() {
  console.log('\n📋 Test 3: TaggedVersionsStrategy');
  console.log('='.repeat(60));

  const strategy = new TaggedVersionsStrategy();

  assertEquals(strategy.getName(), 'TaggedVersions', 'Strategy name should be TaggedVersions');

  const mockService = new MockFileSystemService();
  const versions = mockService.getMockVersions();

  // Add tags to some versions
  versions[1].tag = 'v1.0.0';
  versions[3].tag = 'v0.9.0';

  const toKeep = strategy.filterVersionsToKeep(versions);

  // Latest should always be kept
  assert(toKeep.some(v => v.versionId === 'v1'), 'Latest version should be kept');

  // Tagged versions should be kept
  assert(toKeep.some(v => v.versionId === 'v2'), 'Tagged version (v2) should be kept');
  assert(toKeep.some(v => v.versionId === 'v4'), 'Tagged version (v4) should be kept');

  // Untagged non-latest versions should not be kept
  assert(!toKeep.some(v => v.versionId === 'v7'), 'Untagged old version should not be kept');

  console.log('Kept versions:', toKeep.map(v => v.versionId));
  console.log('✓ TaggedVersionsStrategy test completed\n');
}

async function testRuntimeStrategySwapping() {
  console.log('\n📋 Test 4: Runtime Strategy Swapping');
  console.log('='.repeat(60));

  const mockService = new MockFileSystemService();

  // Start with KeepRecentVersionsStrategy
  const strategy1 = new KeepRecentVersionsStrategy(5);
  const manager = new VersionRetentionManager(mockService, strategy1);

  assertEquals(
    manager.strategy.getName(),
    'KeepRecent(5)',
    'Initial strategy should be KeepRecent(5)'
  );

  // Swap to TimeBasedRetentionStrategy
  const strategy2 = new TimeBasedRetentionStrategy();
  manager.setStrategy(strategy2);

  assertEquals(
    manager.strategy.getName(),
    'TimeBased(24h/7d/30d)',
    'Strategy should be swapped to TimeBased'
  );

  // Swap to TaggedVersionsStrategy
  const strategy3 = new TaggedVersionsStrategy();
  manager.setStrategy(strategy3);

  assertEquals(
    manager.strategy.getName(),
    'TaggedVersions',
    'Strategy should be swapped to TaggedVersions'
  );

  console.log('✓ Runtime strategy swapping test completed\n');
}

async function testRetentionManagerApply() {
  console.log('\n📋 Test 5: VersionRetentionManager Apply Policy');
  console.log('='.repeat(60));

  const mockService = new MockFileSystemService();
  const strategy = new KeepRecentVersionsStrategy(3);
  const manager = new VersionRetentionManager(mockService, strategy);

  mockService.resetDeletedVersions();

  const result = await manager.applyRetentionPolicy('test-proj', 'test.txt');

  assert(result.success, 'Apply retention policy should succeed');
  assertEquals(result.strategy, 'KeepRecent(3)', 'Result should include strategy name');
  assert(result.totalVersions > 0, 'Should report total versions');
  assert(result.keptVersions > 0, 'Should report kept versions');
  assert(result.deletedVersions >= 0, 'Should report deleted versions');

  // Should delete versions (7 total - 3 kept = 4 deleted)
  const deleted = mockService.getDeletedVersions();
  assertEquals(deleted.length, 4, 'Should delete 4 versions (7 total - 3 kept)');

  // Latest should never be deleted
  assert(!deleted.includes('v1'), 'Latest version should not be deleted');

  console.log('Retention result:', result);
  console.log('Deleted versions:', deleted);
  console.log('✓ VersionRetentionManager apply test completed\n');
}

async function testStrategyInterface() {
  console.log('\n📋 Test 6: Strategy Interface Compliance');
  console.log('='.repeat(60));

  const strategies = [
    new KeepRecentVersionsStrategy(10),
    new TimeBasedRetentionStrategy(),
    new TaggedVersionsStrategy()
  ];

  for (const strategy of strategies) {
    // All strategies should have getName method
    assert(
      typeof strategy.getName === 'function',
      `${strategy.constructor.name} should have getName method`
    );

    // All strategies should have filterVersionsToKeep method
    assert(
      typeof strategy.filterVersionsToKeep === 'function',
      `${strategy.constructor.name} should have filterVersionsToKeep method`
    );

    // getName should return a string
    const name = strategy.getName();
    assert(
      typeof name === 'string',
      `${strategy.constructor.name}.getName() should return string`
    );

    console.log(`  ✓ ${strategy.constructor.name} implements IRetentionStrategy`);
  }

  console.log('✓ Strategy interface compliance test completed\n');
}

async function testLatestVersionAlwaysKept() {
  console.log('\n📋 Test 7: Latest Version Always Kept');
  console.log('='.repeat(60));

  const strategies = [
    new KeepRecentVersionsStrategy(1),
    new TimeBasedRetentionStrategy({ keepAllHours: 0, keepDailyDays: 0, keepWeeklyDays: 0 }),
    new TaggedVersionsStrategy()
  ];

  const mockService = new MockFileSystemService();
  const versions = mockService.getMockVersions();

  for (const strategy of strategies) {
    const toKeep = strategy.filterVersionsToKeep(versions);

    assert(
      toKeep.some(v => v.isLatest),
      `${strategy.getName()} should always keep latest version`
    );

    console.log(`  ✓ ${strategy.getName()} keeps latest version`);
  }

  console.log('✓ Latest version test completed\n');
}

// Run all tests
async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       STRATEGY PATTERN TEST SUITE                        ║');
  console.log('║       Testing: Version Retention Strategies              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await testKeepRecentVersionsStrategy();
    await testTimeBasedRetentionStrategy();
    await testTaggedVersionsStrategy();
    await testRuntimeStrategySwapping();
    await testRetentionManagerApply();
    await testStrategyInterface();
    await testLatestVersionAlwaysKept();

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📊 Total Tests: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('\n✅ ALL STRATEGY PATTERN TESTS PASSED!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(console.error);
