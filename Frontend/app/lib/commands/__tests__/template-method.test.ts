/**
 * Template Method Pattern Test Suite
 * Tests BaseCommand template method implementation
 *
 * Run with: npx ts-node Frontend/app/lib/commands/__tests__/template-method.test.ts
 */

import { BaseCommand } from '../BaseCommand';
import { CommandData } from '../Command';

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
    testsPassed++;
  }
}

function assertEquals(actual: any, expected: any, message: string) {
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

// Mock command implementations for testing
class MockSuccessCommand extends BaseCommand {
  public executionLog: string[] = [];

  protected async doExecute(): Promise<void> {
    this.executionLog.push('doExecute called');
  }

  protected async doUndo(): Promise<void> {
    this.executionLog.push('doUndo called');
  }

  canUndo(): boolean {
    return true;
  }

  getDescription(): string {
    return 'Mock Success Command';
  }

  serialize(): CommandData {
    return {
      type: 'MOCK_SUCCESS',
      timestamp: this.timestamp,
      userId: this.userId,
      projectId: this.projectId,
      metadata: {}
    };
  }

  // Expose protected properties for testing
  isExecuted(): boolean {
    return (this as any).executed;
  }

  getTimestamp(): number {
    return this.timestamp;
  }
}

class MockFailingCommand extends BaseCommand {
  protected async doExecute(): Promise<void> {
    throw new Error('Intentional execution failure');
  }

  protected async doUndo(): Promise<void> {
    throw new Error('Intentional undo failure');
  }

  canUndo(): boolean {
    return true;
  }

  getDescription(): string {
    return 'Mock Failing Command';
  }

  serialize(): CommandData {
    return {
      type: 'MOCK_FAILING',
      timestamp: this.timestamp,
      userId: this.userId,
      projectId: this.projectId,
      metadata: {}
    };
  }
}

class MockNonUndoableCommand extends BaseCommand {
  protected async doExecute(): Promise<void> {
    // Do nothing
  }

  protected async doUndo(): Promise<void> {
    // Should never be called
  }

  canUndo(): boolean {
    return false;
  }

  getDescription(): string {
    return 'Mock Non-Undoable Command';
  }

  serialize(): CommandData {
    return {
      type: 'MOCK_NON_UNDOABLE',
      timestamp: this.timestamp,
      userId: this.userId,
      projectId: this.projectId,
      metadata: {}
    };
  }
}

// Tests
async function testTemplateMethodStructure() {
  console.log('\n📋 Test 1: Template Method Structure');
  console.log('='.repeat(60));

  const command = new MockSuccessCommand('user1', 'proj1');

  // Verify initial state
  assertEquals(command.isExecuted(), false, 'Command should not be executed initially');
  assertEquals(command.executionLog.length, 0, 'Execution log should be empty initially');

  // Execute command
  await command.execute();

  // Verify execution state
  assertEquals(command.isExecuted(), true, 'Command should be marked as executed');
  assertEquals(command.executionLog.length, 1, 'doExecute should have been called once');
  assertEquals(command.executionLog[0], 'doExecute called', 'doExecute should be in execution log');

  console.log('✓ Template method structure test completed\n');
}

async function testHookMethodExecutionOrder() {
  console.log('\n📋 Test 2: Hook Method Execution Order');
  console.log('='.repeat(60));

  const command = new MockSuccessCommand('user1', 'proj1');

  // Execute
  await command.execute();
  assertEquals(command.executionLog[0], 'doExecute called', 'doExecute should be called during execute()');

  // Undo
  await command.undo();
  assertEquals(command.executionLog[1], 'doUndo called', 'doUndo should be called during undo()');
  assertEquals(command.isExecuted(), false, 'Command should not be executed after undo');

  // Redo (execute again)
  await command.redo();
  assertEquals(command.executionLog[2], 'doExecute called', 'doExecute should be called again during redo()');
  assertEquals(command.isExecuted(), true, 'Command should be executed after redo');

  console.log('Execution log:', command.executionLog);
  console.log('✓ Hook method execution order test completed\n');
}

async function testPreconditionChecks() {
  console.log('\n📋 Test 3: Precondition Checks');
  console.log('='.repeat(60));

  // Test 3.1: Cannot undo before execute
  const command1 = new MockSuccessCommand('user1', 'proj1');

  try {
    await command1.undo();
    assert(false, 'Should throw error when undoing before execution');
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes("hasn't been executed"),
      'Should prevent undo before execute'
    );
  }

  // Test 3.2: Cannot execute twice
  const command2 = new MockSuccessCommand('user1', 'proj1');
  await command2.execute();

  try {
    await command2.execute();
    assert(false, 'Should throw error on double execution');
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes('already executed'),
      'Should prevent double execution'
    );
  }

  // Test 3.3: Cannot undo non-undoable command
  const command3 = new MockNonUndoableCommand('user1', 'proj1');
  await command3.execute();

  try {
    await command3.undo();
    assert(false, 'Should throw error when undoing non-undoable command');
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes('cannot be undone'),
      'Should prevent undo of non-undoable command'
    );
  }

  console.log('✓ Precondition checks test completed\n');
}

async function testStateTransitions() {
  console.log('\n📋 Test 4: State Transitions');
  console.log('='.repeat(60));

  const command = new MockSuccessCommand('user1', 'proj1');

  // Initial state
  assertEquals(command.isExecuted(), false, 'Initial state: not executed');

  // After execute
  await command.execute();
  assertEquals(command.isExecuted(), true, 'After execute: executed = true');

  // After undo
  await command.undo();
  assertEquals(command.isExecuted(), false, 'After undo: executed = false');

  // After redo
  await command.redo();
  assertEquals(command.isExecuted(), true, 'After redo: executed = true');

  console.log('State transitions verified');
  console.log('✓ State transitions test completed\n');
}

async function testErrorHandling() {
  console.log('\n📋 Test 5: Error Handling in Template Methods');
  console.log('='.repeat(60));

  const command = new MockFailingCommand('user1', 'proj1');

  // Test that errors from doExecute bubble up
  try {
    await command.execute();
    assert(false, 'Should throw error from doExecute');
  } catch (error) {
    assert(
      error instanceof Error && error.message === 'Intentional execution failure',
      'Error from doExecute should bubble up'
    );
  }

  // Command should still not be marked as executed if doExecute fails
  assertEquals((command as any).executed, false, 'Command should not be executed if doExecute fails');

  console.log('✓ Error handling test completed\n');
}

async function testCommonFunctionality() {
  console.log('\n📋 Test 6: Common Functionality in Base Class');
  console.log('='.repeat(60));

  const command = new MockSuccessCommand('user123', 'project456');

  // Test timestamp generation
  const timestamp1 = command.getTimestamp();
  assert(timestamp1 > 0, 'Timestamp should be generated');
  assert(typeof timestamp1 === 'number', 'Timestamp should be a number');

  // Wait a bit and create another command
  await new Promise(resolve => setTimeout(resolve, 10));
  const command2 = new MockSuccessCommand('user123', 'project456');
  const timestamp2 = command2.getTimestamp();

  assert(timestamp2 > timestamp1, 'Later command should have later timestamp');

  // Test description
  const description = command.getDescription();
  assertEquals(description, 'Mock Success Command', 'Description should match');

  console.log('✓ Common functionality test completed\n');
}

async function testRedoIsSameAsExecute() {
  console.log('\n📋 Test 7: Redo Calls Same Hook as Execute');
  console.log('='.repeat(60));

  const command = new MockSuccessCommand('user1', 'proj1');

  // Execute
  await command.execute();
  const logAfterExecute = [...command.executionLog];

  // Undo
  await command.undo();

  // Redo
  await command.redo();

  // Redo should call doExecute, not doUndo
  assertEquals(
    command.executionLog[command.executionLog.length - 1],
    'doExecute called',
    'Redo should call doExecute, not doUndo'
  );

  // Count how many times doExecute was called
  const executeCount = command.executionLog.filter(log => log === 'doExecute called').length;
  assertEquals(executeCount, 2, 'doExecute should be called twice (execute + redo)');

  console.log('Final execution log:', command.executionLog);
  console.log('✓ Redo test completed\n');
}

// Run all tests
async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       TEMPLATE METHOD PATTERN TEST SUITE                 ║');
  console.log('║       Testing: BaseCommand Template Methods              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await testTemplateMethodStructure();
    await testHookMethodExecutionOrder();
    await testPreconditionChecks();
    await testStateTransitions();
    await testErrorHandling();
    await testCommonFunctionality();
    await testRedoIsSameAsExecute();

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📊 Total Tests: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('\n✅ ALL TEMPLATE METHOD PATTERN TESTS PASSED!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(console.error);
