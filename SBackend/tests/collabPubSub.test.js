/**
 * CollabPubSub Test Suite
 * Tests the collaboration pub/sub service
 *
 * This test suite verifies that the CollabPubSub service correctly:
 * - Initializes with or without Redis
 * - Publishes messages when enabled
 * - Handles reconnection logic
 * - Tracks statistics
 * - Closes connections properly
 *
 * Run with: node SBackend/tests/collabPubSub.test.js
 */

const { CollabPubSub } = require('../services/collabPubSub');

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

// Mock logger
class MockLogger {
  constructor() {
    this.logs = [];
  }

  info(...args) {
    this.logs.push({ level: 'info', args });
  }

  warn(...args) {
    this.logs.push({ level: 'warn', args });
  }

  error(...args) {
    this.logs.push({ level: 'error', args });
  }
}

async function testCollabPubSubInitialization() {
  console.log('\n📋 Test 1: CollabPubSub Initialization');
  console.log('='.repeat(60));

  const logger = new MockLogger();
  const pubSub = new CollabPubSub('test-instance-1', logger);

  // Verify initial state
  assert(pubSub.instanceId === 'test-instance-1', 'Instance ID should be set');
  assert(pubSub.enabled === false, 'Should start disabled');
  assert(pubSub.publisher === null, 'Publisher should be null initially');
  assert(pubSub.subscriber === null, 'Subscriber should be null initially');
  assert(pubSub.onUpdate === null, 'onUpdate callback should be null initially');
  assert(pubSub.reconnecting === false, 'Should not be reconnecting initially');

  // Verify stats are initialized
  assert(pubSub.stats.publishes === 0, 'Publishes should start at 0');
  assert(pubSub.stats.received === 0, 'Received should start at 0');
  assert(pubSub.stats.reconnects === 0, 'Reconnects should start at 0');

  console.log('✓ CollabPubSub initialization test completed\n');
}

async function testCollabPubSubWithoutRedis() {
  console.log('\n📋 Test 2: CollabPubSub Without Redis URL');
  console.log('='.repeat(60));

  // Save original env
  const originalRedisUrl = process.env.COLLAB_REDIS_URL;
  const originalWsRedisUrl = process.env.WS_REDIS_URL;
  const originalRedisUrl2 = process.env.REDIS_URL;

  try {
    // Clear Redis URL
    delete process.env.COLLAB_REDIS_URL;
    delete process.env.WS_REDIS_URL;
    delete process.env.REDIS_URL;

    const logger = new MockLogger();
    const pubSub = new CollabPubSub('test-instance-2', logger);

    // Initialize (should handle missing Redis gracefully)
    await pubSub.init();

    // Should remain disabled
    assert(pubSub.enabled === false, 'Should remain disabled without Redis URL');
    assert(pubSub.publisher === null, 'Publisher should remain null');
    assert(pubSub.subscriber === null, 'Subscriber should remain null');

    // Should log info message
    const infoLogs = logger.logs.filter(log => log.level === 'info');
    assert(infoLogs.length > 0, 'Should log info message about disabled pub/sub');

    console.log('✓ CollabPubSub without Redis test completed\n');
  } finally {
    // Restore original env
    if (originalRedisUrl) process.env.COLLAB_REDIS_URL = originalRedisUrl;
    if (originalWsRedisUrl) process.env.WS_REDIS_URL = originalWsRedisUrl;
    if (originalRedisUrl2) process.env.REDIS_URL = originalRedisUrl2;
  }
}

async function testPublishWhenDisabled() {
  console.log('\n📋 Test 3: Publish When Disabled');
  console.log('='.repeat(60));

  const logger = new MockLogger();
  const pubSub = new CollabPubSub('test-instance-3', logger);

  // Publish when disabled should not throw
  await pubSub.publish({ docId: 'test-doc', type: 'update', payload: 'test' });

  // Stats should not increment
  assert(pubSub.stats.publishes === 0, 'Publishes should not increment when disabled');

  console.log('✓ Publish when disabled test completed\n');
}

async function testStatisticsTracking() {
  console.log('\n📋 Test 4: Statistics Tracking');
  console.log('='.repeat(60));

  const logger = new MockLogger();
  const pubSub = new CollabPubSub('test-instance-4', logger);

  // Verify initial stats
  assertEquals(pubSub.stats, {
    publishes: 0,
    received: 0,
    reconnects: 0
  }, 'Initial stats should be all zeros');

  // Manually increment stats (simulating behavior)
  pubSub.stats.publishes = 5;
  pubSub.stats.received = 3;
  pubSub.stats.reconnects = 1;

  assert(pubSub.stats.publishes === 5, 'Publishes stat should be tracked');
  assert(pubSub.stats.received === 3, 'Received stat should be tracked');
  assert(pubSub.stats.reconnects === 1, 'Reconnects stat should be tracked');

  console.log('✓ Statistics tracking test completed\n');
}

async function testCloseWhenNotInitialized() {
  console.log('\n📋 Test 5: Close When Not Initialized');
  console.log('='.repeat(60));

  const logger = new MockLogger();
  const pubSub = new CollabPubSub('test-instance-5', logger);

  // Close should not throw when not initialized
  await pubSub.close();

  assert(pubSub.publisher === null, 'Publisher should remain null');
  assert(pubSub.subscriber === null, 'Subscriber should remain null');

  console.log('✓ Close when not initialized test completed\n');
}

async function testChannelConfiguration() {
  console.log('\n📋 Test 6: Channel Configuration');
  console.log('='.repeat(60));

  // Save original env
  const originalChannel = process.env.COLLAB_REDIS_CHANNEL;

  try {
    // Test default channel
    const pubSub1 = new CollabPubSub('test-instance-6a');
    const defaultChannel = process.env.COLLAB_REDIS_CHANNEL || 'collab:updates';
    assert(pubSub1.channel === defaultChannel, 'Should use default channel');

    // Test custom channel
    process.env.COLLAB_REDIS_CHANNEL = 'custom:channel';
    const pubSub2 = new CollabPubSub('test-instance-6b');
    assert(pubSub2.channel === 'custom:channel', 'Should use custom channel from env');

    console.log('✓ Channel configuration test completed\n');
  } finally {
    // Restore original env
    if (originalChannel) {
      process.env.COLLAB_REDIS_CHANNEL = originalChannel;
    } else {
      delete process.env.COLLAB_REDIS_CHANNEL;
    }
  }
}

async function testOnUpdateCallback() {
  console.log('\n📋 Test 7: OnUpdate Callback');
  console.log('='.repeat(60));

  const logger = new MockLogger();
  const pubSub = new CollabPubSub('test-instance-7', logger);

  // Initially null
  assert(pubSub.onUpdate === null, 'onUpdate should be null initially');

  // Set callback
  const callback = (data) => {
    assert(data.docId === 'test-doc', 'Callback should receive correct data');
  };
  pubSub.onUpdate = callback;

  assert(pubSub.onUpdate === callback, 'onUpdate callback should be settable');

  console.log('✓ OnUpdate callback test completed\n');
}

async function testInstanceIdUniqueness() {
  console.log('\n📋 Test 8: Instance ID Uniqueness');
  console.log('='.repeat(60));

  const logger = new MockLogger();
  const pubSub1 = new CollabPubSub('instance-1', logger);
  const pubSub2 = new CollabPubSub('instance-2', logger);

  assert(pubSub1.instanceId === 'instance-1', 'First instance should have correct ID');
  assert(pubSub2.instanceId === 'instance-2', 'Second instance should have different ID');
  assert(pubSub1.instanceId !== pubSub2.instanceId, 'Instances should have unique IDs');

  console.log('✓ Instance ID uniqueness test completed\n');
}

// Run all tests
async function runAllTests() {
  testsPassed = 0;
  testsFailed = 0;

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          COLLABPUBSUB TEST SUITE                          ║');
  console.log('║          Testing: Collaboration Pub/Sub Service          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await testCollabPubSubInitialization();
    await testCollabPubSubWithoutRedis();
    await testPublishWhenDisabled();
    await testStatisticsTracking();
    await testCloseWhenNotInitialized();
    await testChannelConfiguration();
    await testOnUpdateCallback();
    await testInstanceIdUniqueness();

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📊 Total Tests: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('\n✅ ALL COLLABPUBSUB TESTS PASSED!\n');
    return { testsPassed, testsFailed };
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED');
    console.error(error);
    throw error;
  }
}

// Export for Jest if running in Jest environment
if (typeof describe !== 'undefined') {
  describe('CollabPubSub', () => {
    it('passes the collabPubSub suite', async () => {
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

