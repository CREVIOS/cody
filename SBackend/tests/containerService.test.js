/**
 * ContainerService Test Suite
 * Tests the container service (basic unit tests)
 *
 * This test suite verifies that the ContainerService correctly:
 * - Initializes with proper configuration
 * - Manages container state
 * - Handles configuration
 * - Tracks sessions and containers
 * - Provides utility methods
 *
 * Note: Full integration tests require Docker and are not included here.
 * Run with: node SBackend/tests/containerService.test.js
 */

const ContainerService = require('../services/containerService');

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

// Mock FileSystemService
class MockFileSystemService {
  async getProjectStructure(projectId) {
    return [];
  }
}

// Helper to wait for ContainerService init to complete or timeout
async function waitForInit(service, timeoutMs = 1000) {
  try {
    await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(), timeoutMs);
      service.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      service.once('error', () => {
        clearTimeout(timeout);
        // Ignore init errors in test environment (Docker not available)
        resolve();
      });
    });
  } catch (err) {
    // Ignore Docker connection errors in test environment
  }
}

async function testContainerServiceInitialization() {
  console.log('\n📋 Test 1: ContainerService Initialization');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Verify initialization
  assert(service.fileSystemService === fileSystemService, 'Should store fileSystemService');
  assert(service.containers !== undefined, 'Should have containers Map');
  assert(service.sessions !== undefined, 'Should have sessions Map');
  assert(service.creatingContainers !== undefined, 'Should have creatingContainers Set');
  assert(service.portMonitors !== undefined, 'Should have portMonitors Map');
  assert(service.activePorts !== undefined, 'Should have activePorts Map');
  assert(service.config !== undefined, 'Should have config object');

  console.log('✓ ContainerService initialization test completed\n');
}

async function testContainerServiceConfiguration() {
  console.log('\n📋 Test 2: ContainerService Configuration');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Verify default configuration
  assert(service.config.maxContainers === 10, 'Should have maxContainers set');
  assert(service.config.maxSessionsPerContainer === 5, 'Should have maxSessionsPerContainer set');
  assert(service.config.sessionTimeout === 30 * 60 * 1000, 'Should have sessionTimeout set');
  assert(service.config.containerMemory === 1024 * 1024 * 1024, 'Should have containerMemory set');
  assert(service.config.containerCpu === 1.0, 'Should have containerCpu set');
  assert(Array.isArray(service.config.monitoredPorts), 'Should have monitoredPorts array');
  assert(service.config.monitoredPorts.length > 0, 'Should have monitored ports configured');
  assert(service.config.portCheckInterval === 2000, 'Should have portCheckInterval set');

  console.log('✓ ContainerService configuration test completed\n');
}

async function testContainerServiceImageName() {
  console.log('\n📋 Test 3: ContainerService Image Name');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  assert(service.IMAGE_NAME === 'project-sandbox:latest', 'Should have correct image name');

  console.log('✓ ContainerService image name test completed\n');
}

async function testContainerServiceEventEmitter() {
  console.log('\n📋 Test 4: ContainerService Event Emitter');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Should extend EventEmitter
  assert(service instanceof require('events').EventEmitter, 'Should extend EventEmitter');

  // Test event emission
  let eventReceived = false;
  service.on('test:event', (data) => {
    eventReceived = true;
    assert(data.test === 'value', 'Event should receive data');
  });

  service.emit('test:event', { test: 'value' });
  assert(eventReceived === true, 'Should emit events');

  console.log('✓ ContainerService event emitter test completed\n');
}

async function testContainerServiceMaps() {
  console.log('\n📋 Test 5: ContainerService Maps');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Verify maps are initialized
  assert(service.containers instanceof Map, 'containers should be a Map');
  assert(service.sessions instanceof Map, 'sessions should be a Map');
  assert(service.creatingContainers instanceof Set, 'creatingContainers should be a Set');
  assert(service.portMonitors instanceof Map, 'portMonitors should be a Map');
  assert(service.activePorts instanceof Map, 'activePorts should be a Map');

  // Verify maps are empty initially
  assert(service.containers.size === 0, 'containers should be empty initially');
  assert(service.sessions.size === 0, 'sessions should be empty initially');
  assert(service.creatingContainers.size === 0, 'creatingContainers should be empty initially');

  console.log('✓ ContainerService maps test completed\n');
}

async function testSanitizeTextContent() {
  console.log('\n📋 Test 6: Sanitize Text Content');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Test sanitization
  const contentWithControlChars = 'Hello\u0000World\u0001Test';
  const sanitized = service.sanitizeTextContent(contentWithControlChars);
  
  assert(!sanitized.includes('\u0000'), 'Should remove null characters');
  assert(!sanitized.includes('\u0001'), 'Should remove control characters');
  assert(sanitized.includes('Hello'), 'Should preserve valid content');
  assert(sanitized.includes('World'), 'Should preserve valid content');

  // Test null/undefined
  const nullResult = service.sanitizeTextContent(null);
  assertEquals(nullResult, '', 'Should handle null');

  const undefinedResult = service.sanitizeTextContent(undefined);
  assertEquals(undefinedResult, '', 'Should handle undefined');

  console.log('✓ Sanitize text content test completed\n');
}

async function testShouldSanitizeFile() {
  console.log('\n📋 Test 7: Should Sanitize File');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Test text files that should be sanitized
  assert(service.shouldSanitizeFile('test.py') === true, 'Python files should be sanitized');
  assert(service.shouldSanitizeFile('test.js') === true, 'JavaScript files should be sanitized');
  assert(service.shouldSanitizeFile('test.txt') === true, 'Text files should be sanitized');
  assert(service.shouldSanitizeFile('test.md') === true, 'Markdown files should be sanitized');
  assert(service.shouldSanitizeFile('test.json') === true, 'JSON files should be sanitized');
  assert(service.shouldSanitizeFile('test.html') === true, 'HTML files should be sanitized');
  assert(service.shouldSanitizeFile('test.css') === true, 'CSS files should be sanitized');

  // Test binary files that should not be sanitized
  assert(service.shouldSanitizeFile('test.png') === false, 'PNG files should not be sanitized');
  assert(service.shouldSanitizeFile('test.jpg') === false, 'JPG files should not be sanitized');
  assert(service.shouldSanitizeFile('test.zip') === false, 'ZIP files should not be sanitized');

  // Test files without extension
  assert(service.shouldSanitizeFile('test') === false, 'Files without extension should not be sanitized');

  console.log('✓ Should sanitize file test completed\n');
}

async function testGetActivePortsForProject() {
  console.log('\n📋 Test 8: Get Active Ports For Project');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Test with no active ports
  const emptyPorts = await service.getActivePortsForProject('non-existent');
  assert(Array.isArray(emptyPorts), 'Should return an array');
  assert(emptyPorts.length === 0, 'Should return empty array for non-existent project');

  console.log('✓ Get active ports for project test completed\n');
}

async function testListContainers() {
  console.log('\n📋 Test 9: List Containers');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Test with no containers
  const containers = await service.listContainers();
  assert(Array.isArray(containers), 'Should return an array');
  assert(containers.length === 0, 'Should return empty array when no containers');

  console.log('✓ List containers test completed\n');
}

async function testGetRunningProcesses() {
  console.log('\n📋 Test 10: Get Running Processes');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Test with non-existent project (will return empty array)
  const processes = await service.getRunningProcesses('non-existent');
  assert(Array.isArray(processes), 'Should return an array');
  assert(processes.length === 0, 'Should return empty array for non-existent project');

  console.log('✓ Get running processes test completed\n');
}

async function testParseProcessList() {
  console.log('\n📋 Test 11: Parse Process List');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Mock ps aux output
  const psOutput = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
developer  1000  0.1  0.5 123456 12345 ?        S    10:00   0:00 node server.js
developer  1001  0.2  0.6 123457 12346 ?        S    10:01   0:01 npm start
root       1002  0.0  0.1 123458  1234 ?        S    10:02   0:00 systemd`;

  const processes = service.parseProcessList(psOutput);
  assert(Array.isArray(processes), 'Should return an array');
  assert(processes.length === 2, 'Should parse developer processes only');
  assert(processes[0].user === 'developer', 'Should filter by developer user');
  assert(processes[0].pid === '1000', 'Should parse PID correctly');
  assert(processes[0].command.includes('node'), 'Should parse command correctly');

  console.log('✓ Parse process list test completed\n');
}

async function testCalculateCpuPercent() {
  console.log('\n📋 Test 12: Calculate CPU Percent');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Mock Docker stats
  const stats = {
    cpu_stats: {
      cpu_usage: {
        total_usage: 1000000000
      },
      online_cpus: 2,
      system_cpu_usage: 5000000000
    },
    precpu_stats: {
      cpu_usage: {
        total_usage: 500000000
      },
      system_cpu_usage: 4000000000
    }
  };

  const cpuPercent = service.calculateCpuPercent(stats);
  assert(typeof cpuPercent === 'number', 'Should return a number');
  assert(cpuPercent >= 0, 'CPU percent should be non-negative');

  console.log('✓ Calculate CPU percent test completed\n');
}

async function testCalculateMemoryUsage() {
  console.log('\n📋 Test 13: Calculate Memory Usage');
  console.log('='.repeat(60));

  const fileSystemService = new MockFileSystemService();
  const service = new ContainerService(fileSystemService);
  await waitForInit(service);

  // Mock Docker stats
  const stats = {
    memory_stats: {
      usage: 512 * 1024 * 1024, // 512 MB
      limit: 1024 * 1024 * 1024  // 1 GB
    }
  };

  const memory = service.calculateMemoryUsage(stats);
  assert(typeof memory === 'object', 'Should return an object');
  assert(memory.usage === 512, 'Should calculate usage in MB');
  assert(memory.limit === 1024, 'Should calculate limit in MB');
  assert(memory.percent === 50, 'Should calculate percent correctly');

  console.log('✓ Calculate memory usage test completed\n');
}

// Run all tests
async function runAllTests() {
  testsPassed = 0;
  testsFailed = 0;

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          CONTAINERSERVICE TEST SUITE                      ║');
  console.log('║          Testing: Container Service (Unit Tests)         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await testContainerServiceInitialization();
    await testContainerServiceConfiguration();
    await testContainerServiceImageName();
    await testContainerServiceEventEmitter();
    await testContainerServiceMaps();
    await testSanitizeTextContent();
    await testShouldSanitizeFile();
    await testGetActivePortsForProject();
    await testListContainers();
    await testGetRunningProcesses();
    await testParseProcessList();
    await testCalculateCpuPercent();
    await testCalculateMemoryUsage();

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📊 Total Tests: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('\n✅ ALL CONTAINERSERVICE TESTS PASSED!\n');
    return { testsPassed, testsFailed };
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED');
    console.error(error);
    throw error;
  }
}

// Export for Jest if running in Jest environment
if (typeof describe !== 'undefined') {
  describe('ContainerService', () => {
    it('passes the containerService suite', async () => {
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

