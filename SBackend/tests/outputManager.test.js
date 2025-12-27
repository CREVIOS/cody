/**
 * OutputManager Test Suite
 * Tests the output manager service
 *
 * This test suite verifies that the OutputManager service correctly:
 * - Manages console outputs with buffering
 * - Manages process outputs separately
 * - Emits events for real-time updates
 * - Limits output buffer size
 * - Clears outputs properly
 *
 * Run with: node SBackend/tests/outputManager.test.js
 */

const OutputManager = require('../services/outputManager');

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

async function testOutputManagerInitialization() {
  console.log('\n📋 Test 1: OutputManager Initialization');
  console.log('='.repeat(60));

  const manager = new OutputManager();

  assert(manager.consoleOutputs !== undefined, 'Should have consoleOutputs Map');
  assert(manager.processOutputs !== undefined, 'Should have processOutputs Map');
  assert(manager.maxOutputLines === 1000, 'Should have maxOutputLines set to 1000');
  assert(manager instanceof require('events').EventEmitter, 'Should extend EventEmitter');

  console.log('✓ OutputManager initialization test completed\n');
}

async function testAddConsoleOutput() {
  console.log('\n📋 Test 2: Add Console Output');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  const projectId = 'test-project-1';

  manager.addConsoleOutput(projectId, 'Test output', 'stdout');

  const outputs = manager.getConsoleOutput(projectId);
  assert(outputs.length === 1, 'Should have one output');
  assert(outputs[0].content === 'Test output', 'Output should have correct content');
  assert(outputs[0].type === 'stdout', 'Output should have correct type');
  assert(outputs[0].timestamp !== undefined, 'Output should have timestamp');
  assert(outputs[0].id !== undefined, 'Output should have unique ID');

  console.log('✓ Add console output test completed\n');
}

async function testConsoleOutputEvents() {
  console.log('\n📋 Test 3: Console Output Events');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  const projectId = 'test-project-2';
  let eventReceived = false;
  let eventData = null;

  manager.on('console:output', (data) => {
    eventReceived = true;
    eventData = data;
  });

  manager.addConsoleOutput(projectId, 'Event test', 'stdout');

  // Wait a bit for event
  await new Promise(resolve => setTimeout(resolve, 10));

  assert(eventReceived === true, 'Should emit console:output event');
  assert(eventData.projectId === projectId, 'Event should include projectId');
  assert(eventData.content === 'Event test', 'Event should include content');
  assert(eventData.type === 'stdout', 'Event should include type');

  console.log('✓ Console output events test completed\n');
}

async function testGetConsoleOutput() {
  console.log('\n📋 Test 4: Get Console Output');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  const projectId = 'test-project-3';

  // Add multiple outputs
  for (let i = 0; i < 5; i++) {
    manager.addConsoleOutput(projectId, `Output ${i}`, 'stdout');
  }

  // Get all outputs
  const allOutputs = manager.getConsoleOutput(projectId);
  assert(allOutputs.length === 5, 'Should return all 5 outputs');

  // Get limited outputs
  const limitedOutputs = manager.getConsoleOutput(projectId, 3);
  assert(limitedOutputs.length === 3, 'Should return only 3 outputs');
  assert(limitedOutputs[0].content === 'Output 2', 'Should return last 3 outputs');

  // Get outputs for non-existent project
  const emptyOutputs = manager.getConsoleOutput('non-existent');
  assert(emptyOutputs.length === 0, 'Should return empty array for non-existent project');

  console.log('✓ Get console output test completed\n');
}

async function testClearConsoleOutput() {
  console.log('\n📋 Test 5: Clear Console Output');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  const projectId = 'test-project-4';
  let clearEventReceived = false;

  manager.on('console:cleared', (data) => {
    clearEventReceived = true;
    assert(data.projectId === projectId, 'Clear event should include projectId');
  });

  // Add outputs
  manager.addConsoleOutput(projectId, 'Output 1', 'stdout');
  manager.addConsoleOutput(projectId, 'Output 2', 'stderr');

  // Clear
  manager.clearConsoleOutput(projectId);

  // Wait for event
  await new Promise(resolve => setTimeout(resolve, 10));

  assert(clearEventReceived === true, 'Should emit console:cleared event');
  const outputs = manager.getConsoleOutput(projectId);
  assert(outputs.length === 0, 'Outputs should be cleared');

  console.log('✓ Clear console output test completed\n');
}

async function testAddProcessOutput() {
  console.log('\n📋 Test 6: Add Process Output');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  const projectId = 'test-project-5';
  const processId = 'process-123';

  manager.addProcessOutput(projectId, processId, 'Process output', 'stdout');

  const outputs = manager.getProcessOutput(projectId, processId);
  assert(outputs.length === 1, 'Should have one process output');
  assert(outputs[0].content === 'Process output', 'Output should have correct content');
  assert(outputs[0].processId === processId, 'Output should have processId');
  assert(outputs[0].type === 'stdout', 'Output should have correct type');

  // Should also add to console output
  const consoleOutputs = manager.getConsoleOutput(projectId);
  assert(consoleOutputs.length > 0, 'Should also add to console output');
  assert(consoleOutputs[consoleOutputs.length - 1].content.includes(processId), 'Console output should include processId');

  console.log('✓ Add process output test completed\n');
}

async function testProcessOutputEvents() {
  console.log('\n📋 Test 7: Process Output Events');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  const projectId = 'test-project-6';
  const processId = 'process-456';
  let eventReceived = false;
  let eventData = null;

  manager.on('process:output', (data) => {
    eventReceived = true;
    eventData = data;
  });

  manager.addProcessOutput(projectId, processId, 'Process event test', 'stdout');

  // Wait for event
  await new Promise(resolve => setTimeout(resolve, 10));

  assert(eventReceived === true, 'Should emit process:output event');
  assert(eventData.projectId === projectId, 'Event should include projectId');
  assert(eventData.processId === processId, 'Event should include processId');
  assert(eventData.content === 'Process event test', 'Event should include content');

  console.log('✓ Process output events test completed\n');
}

async function testGetProcessOutput() {
  console.log('\n📋 Test 8: Get Process Output');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  const projectId = 'test-project-7';
  const processId = 'process-789';

  // Add multiple outputs
  for (let i = 0; i < 5; i++) {
    manager.addProcessOutput(projectId, processId, `Process output ${i}`, 'stdout');
  }

  // Get all outputs
  const allOutputs = manager.getProcessOutput(projectId, processId);
  assert(allOutputs.length === 5, 'Should return all 5 outputs');

  // Get limited outputs
  const limitedOutputs = manager.getProcessOutput(projectId, processId, 2);
  assert(limitedOutputs.length === 2, 'Should return only 2 outputs');

  // Get outputs for non-existent process
  const emptyOutputs = manager.getProcessOutput(projectId, 'non-existent');
  assert(emptyOutputs.length === 0, 'Should return empty array for non-existent process');

  console.log('✓ Get process output test completed\n');
}

async function testClearProcessOutput() {
  console.log('\n📋 Test 9: Clear Process Output');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  const projectId = 'test-project-8';
  const processId = 'process-999';
  let clearEventReceived = false;

  manager.on('process:cleared', (data) => {
    clearEventReceived = true;
    assert(data.projectId === projectId, 'Clear event should include projectId');
    assert(data.processId === processId, 'Clear event should include processId');
  });

  // Add outputs
  manager.addProcessOutput(projectId, processId, 'Output 1', 'stdout');
  manager.addProcessOutput(projectId, processId, 'Output 2', 'stderr');

  // Clear
  manager.clearProcessOutput(projectId, processId);

  // Wait for event
  await new Promise(resolve => setTimeout(resolve, 10));

  assert(clearEventReceived === true, 'Should emit process:cleared event');
  const outputs = manager.getProcessOutput(projectId, processId);
  assert(outputs.length === 0, 'Process outputs should be cleared');

  console.log('✓ Clear process output test completed\n');
}

async function testOutputBufferLimit() {
  console.log('\n📋 Test 10: Output Buffer Limit');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  manager.maxOutputLines = 5; // Set small limit for testing
  const projectId = 'test-project-9';

  // Add more outputs than limit
  for (let i = 0; i < 10; i++) {
    manager.addConsoleOutput(projectId, `Output ${i}`, 'stdout');
  }

  const outputs = manager.getConsoleOutput(projectId);
  assert(outputs.length === 5, 'Should only keep last 5 outputs');
  assert(outputs[0].content === 'Output 5', 'Should keep most recent outputs');
  assert(outputs[4].content === 'Output 9', 'Should keep latest output');

  console.log('✓ Output buffer limit test completed\n');
}

async function testMultipleProjects() {
  console.log('\n📋 Test 11: Multiple Projects');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  const projectId1 = 'project-1';
  const projectId2 = 'project-2';

  manager.addConsoleOutput(projectId1, 'Project 1 output', 'stdout');
  manager.addConsoleOutput(projectId2, 'Project 2 output', 'stdout');

  const outputs1 = manager.getConsoleOutput(projectId1);
  const outputs2 = manager.getConsoleOutput(projectId2);

  assert(outputs1.length === 1, 'Project 1 should have its own outputs');
  assert(outputs2.length === 1, 'Project 2 should have its own outputs');
  assert(outputs1[0].content === 'Project 1 output', 'Projects should be isolated');
  assert(outputs2[0].content === 'Project 2 output', 'Projects should be isolated');

  console.log('✓ Multiple projects test completed\n');
}

async function testMultipleProcesses() {
  console.log('\n📋 Test 12: Multiple Processes');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  const projectId = 'test-project-10';
  const processId1 = 'process-1';
  const processId2 = 'process-2';

  manager.addProcessOutput(projectId, processId1, 'Process 1 output', 'stdout');
  manager.addProcessOutput(projectId, processId2, 'Process 2 output', 'stdout');

  const outputs1 = manager.getProcessOutput(projectId, processId1);
  const outputs2 = manager.getProcessOutput(projectId, processId2);

  assert(outputs1.length === 1, 'Process 1 should have its own outputs');
  assert(outputs2.length === 1, 'Process 2 should have its own outputs');
  assert(outputs1[0].content === 'Process 1 output', 'Processes should be isolated');
  assert(outputs2[0].content === 'Process 2 output', 'Processes should be isolated');

  console.log('✓ Multiple processes test completed\n');
}

async function testOutputTypes() {
  console.log('\n📋 Test 13: Output Types');
  console.log('='.repeat(60));

  const manager = new OutputManager();
  const projectId = 'test-project-11';

  manager.addConsoleOutput(projectId, 'Stdout message', 'stdout');
  manager.addConsoleOutput(projectId, 'Stderr message', 'stderr');

  const outputs = manager.getConsoleOutput(projectId);
  assert(outputs.length === 2, 'Should have both output types');
  assert(outputs[0].type === 'stdout', 'First output should be stdout');
  assert(outputs[1].type === 'stderr', 'Second output should be stderr');

  console.log('✓ Output types test completed\n');
}

// Run all tests
async function runAllTests() {
  testsPassed = 0;
  testsFailed = 0;

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          OUTPUTMANAGER TEST SUITE                           ║');
  console.log('║          Testing: Output Manager Service                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await testOutputManagerInitialization();
    await testAddConsoleOutput();
    await testConsoleOutputEvents();
    await testGetConsoleOutput();
    await testClearConsoleOutput();
    await testAddProcessOutput();
    await testProcessOutputEvents();
    await testGetProcessOutput();
    await testClearProcessOutput();
    await testOutputBufferLimit();
    await testMultipleProjects();
    await testMultipleProcesses();
    await testOutputTypes();

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📊 Total Tests: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('\n✅ ALL OUTPUTMANAGER TESTS PASSED!\n');
    return { testsPassed, testsFailed };
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED');
    console.error(error);
    throw error;
  }
}

// Additional Jest tests for coverage
if (typeof describe !== 'undefined') {
  describe('OutputManager', () => {
    it('passes the outputManager suite', async () => {
      const result = await runAllTests();
      expect(result.testsFailed).toBe(0);
    });

    describe('Additional Coverage Tests', () => {
      let manager;

      beforeEach(() => {
        manager = new OutputManager();
      });

      it('should get all outputs for a project', () => {
        const projectId = 'test-project';
        manager.addConsoleOutput(projectId, 'Console output', 'stdout');
        manager.addProcessOutput(projectId, 'proc1', 'Process output', 'stdout');
        manager.addProcessOutput(projectId, 'proc2', 'Another process', 'stdout');

        const allOutputs = manager.getAllOutputs(projectId);

        expect(allOutputs.console).toBeDefined();
        expect(allOutputs.processes).toBeDefined();
        expect(allOutputs.processes.proc1).toBeDefined();
        expect(allOutputs.processes.proc2).toBeDefined();
      });

      it('should cleanup old outputs', () => {
        const projectId = 'test-project';
        const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
        
        // Manually add old entries
        manager.consoleOutputs.set(projectId, [{
          timestamp: oldDate.toISOString(),
          content: 'Old output'
        }, {
          timestamp: new Date().toISOString(),
          content: 'Recent output'
        }]);

        manager.cleanup(24 * 60 * 60 * 1000); // 24 hours

        const outputs = manager.getConsoleOutput(projectId);
        expect(outputs.length).toBe(1);
        expect(outputs[0].content).toBe('Recent output');
      });

      it('should get statistics', () => {
        const projectId = 'test-project';
        manager.addConsoleOutput(projectId, 'Output 1', 'stdout');
        manager.addConsoleOutput(projectId, 'Output 2', 'stderr');
        manager.addProcessOutput(projectId, 'proc1', 'Process output', 'stdout');

        const stats = manager.getStats();

        expect(stats.totalProjects).toBe(1);
        expect(stats.totalProcesses).toBe(1);
        expect(stats.totalOutputLines).toBeGreaterThan(0);
        expect(stats.memoryUsage).toBeGreaterThan(0);
      });

      it('should handle cleanup with no old outputs', () => {
        const projectId = 'test-project';
        manager.addConsoleOutput(projectId, 'Recent output', 'stdout');

        manager.cleanup(24 * 60 * 60 * 1000);

        const outputs = manager.getConsoleOutput(projectId);
        expect(outputs.length).toBe(1);
      });

      it('should handle getAllOutputs for non-existent project', () => {
        const allOutputs = manager.getAllOutputs('non-existent');
        expect(allOutputs.console).toEqual([]);
        expect(allOutputs.processes).toEqual({});
      });
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

