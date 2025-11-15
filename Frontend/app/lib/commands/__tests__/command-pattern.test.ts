/**
 * Command Pattern Test Suite
 * Tests RestoreVersionCommand implementation
 *
 * Run with: npx ts-node Frontend/app/lib/commands/__tests__/command-pattern.test.ts
 */

import { RestoreVersionCommand, VersionService, FileVersion } from '../RestoreVersionCommand';
import { CommandManager } from '../CommandManager';

// Mock VersionService for testing
class MockVersionService implements VersionService {
  private fileContent: string = 'Version 3 - Latest';
  private versions: FileVersion[] = [
    {
      versionId: 'v3-latest',
      isLatest: true,
      lastModified: '2025-01-15T10:00:00Z',
      size: 100,
      etag: 'etag3',
      isDeleteMarker: false
    },
    {
      versionId: 'v2-middle',
      isLatest: false,
      lastModified: '2025-01-15T09:00:00Z',
      size: 90,
      etag: 'etag2',
      isDeleteMarker: false
    },
    {
      versionId: 'v1-oldest',
      isLatest: false,
      lastModified: '2025-01-15T08:00:00Z',
      size: 80,
      etag: 'etag1',
      isDeleteMarker: false
    }
  ];

  private versionContents: Record<string, string> = {
    'v1-oldest': 'Version 1',
    'v2-middle': 'Version 2',
    'v3-latest': 'Version 3 - Latest'
  };

  async listFileVersions(projectId: string, filePath: string): Promise<{ success: boolean; versions: FileVersion[] }> {
    return { success: true, versions: this.versions };
  }

  async getFileVersion(projectId: string, filePath: string, versionId: string): Promise<{ success: boolean; content: string }> {
    const content = this.versionContents[versionId];
    if (!content) {
      return { success: false, content: '' };
    }
    return { success: true, content };
  }

  async restoreFileVersion(projectId: string, filePath: string, versionId: string): Promise<{ success: boolean }> {
    const content = this.versionContents[versionId];
    if (!content) {
      return { success: false };
    }

    // Simulate restoring: set current content to target version
    this.fileContent = content;

    // Update latest version marker
    this.versions = this.versions.map(v => ({
      ...v,
      isLatest: v.versionId === versionId
    }));

    return { success: true };
  }

  async getCurrentFileContent(projectId: string, filePath: string): Promise<{ success: boolean; content: string }> {
    return { success: true, content: this.fileContent };
  }

  // Test helper
  getCurrentContent(): string {
    return this.fileContent;
  }
}

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

// Tests
async function testCommandExecution() {
  console.log('\n📋 Test 1: Command Execution');
  console.log('=' .repeat(60));

  const mockService = new MockVersionService();
  const command = new RestoreVersionCommand(
    'user123',
    'test-proj',
    'test.txt',
    'v1-oldest',
    mockService
  );

  // Before execution
  assertEquals(mockService.getCurrentContent(), 'Version 3 - Latest', 'Initial content should be latest version');

  // Execute command
  await command.execute();

  // After execution
  assertEquals(mockService.getCurrentContent(), 'Version 1', 'Content should be restored to Version 1');
  assert(command.canUndo(), 'Command should be undoable after execution');

  console.log('✓ Command execution test completed\n');
}

async function testCommandUndo() {
  console.log('\n📋 Test 2: Command Undo');
  console.log('=' .repeat(60));

  const mockService = new MockVersionService();
  const command = new RestoreVersionCommand(
    'user123',
    'test-proj',
    'test.txt',
    'v1-oldest',
    mockService
  );

  // Execute
  await command.execute();
  assertEquals(mockService.getCurrentContent(), 'Version 1', 'Content should be restored to Version 1');

  // Undo
  await command.undo();
  assertEquals(mockService.getCurrentContent(), 'Version 3 - Latest', 'Content should be reverted to latest version after undo');

  console.log('✓ Command undo test completed\n');
}

async function testCommandSerialization() {
  console.log('\n📋 Test 3: Command Serialization');
  console.log('=' .repeat(60));

  const mockService = new MockVersionService();
  const command = new RestoreVersionCommand(
    'user123',
    'test-proj',
    'test.txt',
    'v1-oldest',
    mockService
  );

  await command.execute();

  const serialized = command.serialize();

  assertEquals(serialized.type, 'RESTORE_VERSION', 'Serialized type should be RESTORE_VERSION');
  assertEquals(serialized.userId, 'user123', 'Serialized userId should match');
  assertEquals(serialized.projectId, 'test-proj', 'Serialized projectId should match');
  assert(serialized.metadata.filePath === 'test.txt', 'Serialized filePath should match');
  assert(serialized.metadata.targetVersionId === 'v1-oldest', 'Serialized targetVersionId should match');
  assert(serialized.metadata.previousVersionId !== null, 'Serialized should have previousVersionId');

  console.log('Serialized command:', JSON.stringify(serialized, null, 2));
  console.log('✓ Command serialization test completed\n');
}

async function testCommandManagerIntegration() {
  console.log('\n📋 Test 4: CommandManager Integration');
  console.log('=' .repeat(60));

  const mockService = new MockVersionService();
  const command = new RestoreVersionCommand(
    'user123',
    'test-proj',
    'test.txt',
    'v2-middle',
    mockService
  );

  const manager = new CommandManager();

  // Execute via manager
  await manager.execute(command);
  assertEquals(mockService.getCurrentContent(), 'Version 2', 'Content should be Version 2 after execute');
  assert(manager.canUndo(), 'Manager should have undoable commands');

  // Undo via manager
  await manager.undo();
  assertEquals(mockService.getCurrentContent(), 'Version 3 - Latest', 'Content should be latest after undo');
  assert(manager.canRedo(), 'Manager should have redoable commands');

  // Redo via manager
  await manager.redo();
  assertEquals(mockService.getCurrentContent(), 'Version 2', 'Content should be Version 2 after redo');

  console.log('✓ CommandManager integration test completed\n');
}

async function testCommandStateManagement() {
  console.log('\n📋 Test 5: Command State Management');
  console.log('=' .repeat(60));

  const mockService = new MockVersionService();
  const command = new RestoreVersionCommand(
    'user123',
    'test-proj',
    'test.txt',
    'v1-oldest',
    mockService
  );

  // Test double execution prevention
  await command.execute();

  try {
    await command.execute();
    assert(false, 'Should throw error on double execution');
  } catch (error) {
    assert(error instanceof Error && error.message.includes('already executed'), 'Should prevent double execution');
  }

  // Test undo before execute prevention
  const command2 = new RestoreVersionCommand(
    'user123',
    'test-proj',
    'test.txt',
    'v1-oldest',
    mockService
  );

  try {
    await command2.undo();
    assert(false, 'Should throw error when undoing before execution');
  } catch (error) {
    assert(error instanceof Error && error.message.includes("hasn't been executed"), 'Should prevent undo before execute');
  }

  console.log('✓ Command state management test completed\n');
}

// Run all tests
async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       COMMAND PATTERN TEST SUITE                          ║');
  console.log('║       Testing: RestoreVersionCommand                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await testCommandExecution();
    await testCommandUndo();
    await testCommandSerialization();
    await testCommandManagerIntegration();
    await testCommandStateManagement();

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📊 Total Tests: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('\n✅ ALL COMMAND PATTERN TESTS PASSED!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(console.error);
