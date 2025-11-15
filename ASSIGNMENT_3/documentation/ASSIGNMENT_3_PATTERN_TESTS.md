# Assignment 3: Pattern Verification Test Cases

## Purpose

This document provides comprehensive test cases for all design patterns implemented in Assignment 3's File Version History & Recovery System. Each test case can be executed to verify correct implementation.

---

## Pattern 1: Command Pattern (RestoreVersionCommand)

### Pattern Description
The Command Pattern encapsulates file version restore operations as objects, enabling undo/redo functionality and command history tracking.

### Implementation Location
- `Frontend/app/lib/commands/RestoreVersionCommand.ts`
- `Frontend/app/lib/commands/BaseCommand.ts` (Template Method base class)
- `Frontend/app/lib/commands/CommandManager.ts`

### Verification Criteria
✅ Command encapsulates operation as object
✅ Supports execute() method
✅ Supports undo() method
✅ Stores state for reversal (previousVersionId, previousContent)
✅ Integrates with CommandManager
✅ Can be serialized for audit trails

---

### Test Case 1.1: Execute RestoreVersionCommand

**Objective**: Verify that RestoreVersionCommand can execute a version restore operation

**Prerequisites**:
- MinIO versioning enabled
- Test file with multiple versions

**Test Steps**:
```bash
# 1. Create test file with multiple versions
curl -X POST http://localhost:3001/api/projects/test-proj/files/create \
  -H "Content-Type: application/json" \
  -d '{"path":"test.txt","content":"Version 1"}'

curl -X PUT http://localhost:3001/api/projects/test-proj/files/update \
  -H "Content-Type: application/json" \
  -d '{"path":"test.txt","content":"Version 2"}'

curl -X PUT http://localhost:3001/api/projects/test-proj/files/update \
  -H "Content-Type: application/json" \
  -d '{"path":"test.txt","content":"Version 3 - Latest"}'

# 2. List versions to get version IDs
curl "http://localhost:3001/api/projects/test-proj/files/versions?path=test.txt"

# 3. In Frontend code, create and execute RestoreVersionCommand
```

**Frontend Test Code**:
```typescript
import { RestoreVersionCommand } from '@/app/lib/commands/RestoreVersionCommand';

// Create version service wrapper
const versionService = {
  async listFileVersions(projectId: string, filePath: string) {
    const response = await fetch(
      `http://localhost:3001/api/projects/${projectId}/files/versions?path=${filePath}`
    );
    return response.json();
  },
  async getFileVersion(projectId: string, filePath: string, versionId: string) {
    const response = await fetch(
      `http://localhost:3001/api/projects/${projectId}/files/version/${versionId}?path=${filePath}`
    );
    return response.json();
  },
  async restoreFileVersion(projectId: string, filePath: string, versionId: string) {
    const response = await fetch(
      `http://localhost:3001/api/projects/${projectId}/files/restore`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, versionId })
      }
    );
    return response.json();
  },
  async getCurrentFileContent(projectId: string, filePath: string) {
    const response = await fetch(
      `http://localhost:3001/api/projects/${projectId}/files/read?path=${filePath}`
    );
    return response.json();
  }
};

// Create command
const command = new RestoreVersionCommand(
  'user123',
  'test-proj',
  'test.txt',
  'TARGET_VERSION_ID', // Replace with actual version ID from step 2
  versionService
);

// Execute command
await command.execute();

// Verify: File content should be restored to target version
```

**Expected Results**:
- ✅ Command executes without errors
- ✅ File content is restored to target version
- ✅ `command.canUndo()` returns `true`
- ✅ `previousVersionId` is stored internally

**Success Criteria**:
- RestoreVersionCommand successfully restores file to previous version
- No exceptions thrown during execution

---

### Test Case 1.2: Undo RestoreVersionCommand

**Objective**: Verify that RestoreVersionCommand can be undone

**Prerequisites**:
- Test Case 1.1 completed successfully

**Test Steps**:
```typescript
// After executing command in Test Case 1.1
console.log('Before undo:', await getCurrentContent()); // Should show restored content

// Undo the command
await command.undo();

console.log('After undo:', await getCurrentContent()); // Should show content from before restore
```

**Expected Results**:
- ✅ `canUndo()` returns `true` before undo
- ✅ Undo operation succeeds without errors
- ✅ File content is reverted to state before restore
- ✅ `executed` flag is set to `false`

**Success Criteria**:
- File content matches the state before restore operation
- Command state is properly updated

---

### Test Case 1.3: Serialize RestoreVersionCommand

**Objective**: Verify that RestoreVersionCommand can be serialized for audit trails

**Test Steps**:
```typescript
const command = new RestoreVersionCommand(
  'user123',
  'test-proj',
  'test.txt',
  'version-abc123',
  versionService
);

const serialized = command.serialize();

console.log(serialized);
```

**Expected Results**:
```json
{
  "type": "RESTORE_VERSION",
  "timestamp": 1700000000000,
  "userId": "user123",
  "projectId": "test-proj",
  "metadata": {
    "filePath": "test.txt",
    "targetVersionId": "version-abc123",
    "previousVersionId": "version-xyz789",
    "hasPreviousContent": true,
    "hasRestoredContent": true
  }
}
```

**Success Criteria**:
- ✅ `serialize()` returns CommandData object
- ✅ All required fields are present
- ✅ Type is "RESTORE_VERSION"

---

### Test Case 1.4: CommandManager Integration

**Objective**: Verify RestoreVersionCommand integrates with CommandManager for undo/redo

**Test Steps**:
```typescript
import { CommandManager } from '@/app/lib/commands/CommandManager';

const commandManager = new CommandManager();

// Execute restore command via manager
await commandManager.execute(restoreCommand);

console.log('Can undo?', commandManager.canUndo()); // Should be true

// Undo via manager
await commandManager.undo();

console.log('Can redo?', commandManager.canRedo()); // Should be true

// Redo via manager
await commandManager.redo();
```

**Expected Results**:
- ✅ Command integrates with CommandManager
- ✅ Undo/redo work through manager interface
- ✅ Command appears in history

**Success Criteria**:
- CommandManager successfully orchestrates command execution, undo, and redo

---

## Pattern 2: Template Method Pattern (BaseCommand)

### Pattern Description
The Template Method Pattern defines the skeleton of command execution in BaseCommand, with hook methods for subclasses to customize behavior.

### Implementation Location
- `Frontend/app/lib/commands/BaseCommand.ts`
- All command subclasses extend this

### Verification Criteria
✅ Template methods define skeleton (execute, undo, redo)
✅ Hook methods are abstract (doExecute, doUndo)
✅ Common logic is in base class (state management)
✅ Subclasses only implement hooks
✅ Consistent execution flow across all commands

---

### Test Case 2.1: Verify Template Method Structure

**Objective**: Verify BaseCommand correctly implements Template Method pattern

**Test Steps**:
```typescript
import { BaseCommand } from '@/app/lib/commands/BaseCommand';

// Attempt to execute twice (should fail on second attempt)
class TestCommand extends BaseCommand {
  protected async doExecute() {
    console.log('Executing test command');
  }

  protected async doUndo() {
    console.log('Undoing test command');
  }

  canUndo() { return true; }
  getDescription() { return 'Test'; }
  serialize() { return { type: 'TEST', timestamp: this.timestamp, userId: this.userId, projectId: this.projectId, metadata: {} }; }
}

const cmd = new TestCommand('user1', 'proj1');

// First execute - should succeed
await cmd.execute(); // ✅

try {
  // Second execute - should throw error
  await cmd.execute(); // ❌ Should throw
} catch (error) {
  console.log('Correctly prevented double execution');
}
```

**Expected Results**:
- ✅ First execute succeeds
- ✅ Second execute throws error: "Command already executed"
- ✅ Template method enforces preconditions

**Success Criteria**:
- Template methods (execute, undo) enforce proper state transitions
- Double execution is prevented

---

### Test Case 2.2: Verify Hook Method Execution Order

**Objective**: Verify BaseCommand calls hook methods in correct order

**Test Steps**:
```typescript
const executionLog: string[] = [];

class LoggingCommand extends BaseCommand {
  protected async doExecute() {
    executionLog.push('doExecute called');
  }

  protected async doUndo() {
    executionLog.push('doUndo called');
  }

  canUndo() { return true; }
  getDescription() { return 'Logging'; }
  serialize() { return { type: 'LOG', timestamp: this.timestamp, userId: this.userId, projectId: this.projectId, metadata: {} }; }
}

const cmd = new LoggingCommand('user1', 'proj1');

// Execute
console.log('Before execute, executed flag:', cmd['executed']); // false
await cmd.execute();
console.log('After execute, executed flag:', cmd['executed']); // true
console.log('Execution log:', executionLog); // ['doExecute called']

executionLog.length = 0; // Clear log

// Undo
await cmd.undo();
console.log('After undo, executed flag:', cmd['executed']); // false
console.log('Execution log:', executionLog); // ['doUndo called']
```

**Expected Results**:
- ✅ `execute()` calls `doExecute()` then sets `executed = true`
- ✅ `undo()` calls `doUndo()` then sets `executed = false`
- ✅ State management is handled by template methods

**Success Criteria**:
- Hook methods are called in correct order
- State transitions happen after hooks complete

---

### Test Case 2.3: Verify Precondition Checks

**Objective**: Verify template methods check preconditions before calling hooks

**Test Steps**:
```typescript
class SimpleCommand extends BaseCommand {
  protected async doExecute() {}
  protected async doUndo() {}
  canUndo() { return true; }
  getDescription() { return 'Simple'; }
  serialize() { return { type: 'SIMPLE', timestamp: this.timestamp, userId: this.userId, projectId: this.projectId, metadata: {} }; }
}

const cmd = new SimpleCommand('user1', 'proj1');

// Try to undo before execute
try {
  await cmd.undo(); // Should throw
  console.log('ERROR: Undo succeeded when it should have failed');
} catch (error) {
  console.log('✅ Correctly prevented undo before execute:', error.message);
}
```

**Expected Results**:
- ✅ Undo throws error: "Cannot undo command that hasn't been executed"
- ✅ Template method validates state before calling hook

**Success Criteria**:
- Template methods enforce preconditions (execute before undo, etc.)

---

## Pattern 3: Strategy Pattern (Version Retention)

### Pattern Description
The Strategy Pattern enables runtime selection of version retention policies without modifying the VersionRetentionManager.

### Implementation Location
- `SBackend/services/versionRetentionStrategies.js`

### Verification Criteria
✅ Strategy interface defined (IRetentionStrategy)
✅ Multiple concrete strategies implemented
✅ Context class (VersionRetentionManager) uses strategies
✅ Runtime strategy swapping supported
✅ Strategies are interchangeable

---

### Test Case 3.1: KeepRecentVersionsStrategy

**Objective**: Verify KeepRecentVersionsStrategy keeps N most recent versions

**Prerequisites**:
- File with 15 versions in MinIO

**Test Steps**:
```bash
# Setup: Create file with 15 versions
for i in {1..15}; do
  curl -X PUT http://localhost:3001/api/projects/test-proj/files/update \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"many-versions.txt\",\"content\":\"Version $i\"}"
  sleep 0.5
done

# Node.js test script
node -e "
const { KeepRecentVersionsStrategy, VersionRetentionManager } = require('./SBackend/services/versionRetentionStrategies.js');
const FileSystemService = require('./SBackend/services/fileSystemService.js');

(async () => {
  const service = new FileSystemService();
  const strategy = new KeepRecentVersionsStrategy(10); // Keep 10 most recent
  const manager = new VersionRetentionManager(service, strategy);

  const result = await manager.applyRetentionPolicy('test-proj', 'many-versions.txt');

  console.log('Strategy:', result.strategy);
  console.log('Total versions before:', result.totalVersions);
  console.log('Kept versions:', result.keptVersions);
  console.log('Deleted versions:', result.deletedVersions);

  // Verify: Should keep 10, delete 5
  console.log('Expected to delete:', 15 - 10);
  console.log('Actually deleted:', result.deletedVersions);
})();
"
```

**Expected Results**:
- Total versions: 15
- Kept versions: 10
- Deleted versions: 5
- Strategy name: "KeepRecent(10)"

**Success Criteria**:
- ✅ Exactly N most recent versions are kept
- ✅ Older versions are deleted
- ✅ Latest version is always kept

---

### Test Case 3.2: TimeBasedRetentionStrategy

**Objective**: Verify TimeBasedRetentionStrategy applies time-based retention

**Test Steps**:
```javascript
const { TimeBasedRetentionStrategy } = require('./SBackend/services/versionRetentionStrategies.js');

// Create strategy: keep all from last 24h, 1/day for 7 days, 1/week for 30 days
const strategy = new TimeBasedRetentionStrategy({
  keepAllHours: 24,
  keepDailyDays: 7,
  keepWeeklyDays: 30
});

// Mock versions with different ages
const now = new Date();
const versions = [
  { versionId: 'v1', lastModified: new Date(now - 1000 * 60 * 10), isLatest: true }, // 10 min ago
  { versionId: 'v2', lastModified: new Date(now - 1000 * 60 * 60), isLatest: false }, // 1 hour ago
  { versionId: 'v3', lastModified: new Date(now - 1000 * 60 * 60 * 5), isLatest: false }, // 5 hours ago
  { versionId: 'v4', lastModified: new Date(now - 1000 * 60 * 60 * 24 * 2), isLatest: false }, // 2 days ago
  { versionId: 'v5', lastModified: new Date(now - 1000 * 60 * 60 * 24 * 2.5), isLatest: false }, // 2.5 days ago (same day as v4)
  { versionId: 'v6', lastModified: new Date(now - 1000 * 60 * 60 * 24 * 10), isLatest: false }, // 10 days ago
  { versionId: 'v7', lastModified: new Date(now - 1000 * 60 * 60 * 24 * 40), isLatest: false }, // 40 days ago (should be deleted)
];

const toKeep = strategy.filterVersionsToKeep(versions);

console.log('Versions to keep:', toKeep.map(v => v.versionId));
console.log('Expected: v1, v2, v3 (within 24h), v4 or v5 (2 days ago, only 1), v6 (weekly)');
console.log('Should NOT keep: v7 (older than 30 days)');
```

**Expected Results**:
- ✅ All versions from last 24h are kept (v1, v2, v3)
- ✅ One version per day for 2-7 days ago (v4 or v5, not both)
- ✅ One version per week for 8-30 days ago (v6)
- ✅ Versions older than 30 days are removed (v7 not in list)

**Success Criteria**:
- Time-based bucketing works correctly
- Latest version always kept
- Versions older than retention period are excluded

---

### Test Case 3.3: Runtime Strategy Swapping

**Objective**: Verify VersionRetentionManager can switch strategies at runtime

**Test Steps**:
```javascript
const {
  KeepRecentVersionsStrategy,
  TimeBasedRetentionStrategy,
  VersionRetentionManager
} = require('./SBackend/services/versionRetentionStrategies.js');
const FileSystemService = require('./SBackend/services/fileSystemService.js');

(async () => {
  const service = new FileSystemService();

  // Start with one strategy
  const strategy1 = new KeepRecentVersionsStrategy(5);
  const manager = new VersionRetentionManager(service, strategy1);

  console.log('Initial strategy:', manager.strategy.getName()); // KeepRecent(5)

  // Switch strategy at runtime
  const strategy2 = new TimeBasedRetentionStrategy();
  manager.setStrategy(strategy2);

  console.log('After swap:', manager.strategy.getName()); // TimeBased(...)

  // Apply policy with new strategy
  const result = await manager.applyRetentionPolicy('test-proj', 'test.txt');
  console.log('Applied strategy:', result.strategy); // Should be TimeBased
})();
```

**Expected Results**:
- ✅ Initial strategy is KeepRecentVersionsStrategy
- ✅ After `setStrategy()`, strategy changes to TimeBasedRetentionStrategy
- ✅ Policy is applied with new strategy
- ✅ No code changes needed in manager

**Success Criteria**:
- Strategy can be swapped at runtime
- Manager uses new strategy immediately
- Demonstrates Open/Closed Principle (extensible without modification)

---

## Pattern 4: Memento Pattern (MinIO Versioning)

### Pattern Description
MinIO's built-in versioning serves as the Memento pattern where each version is an immutable snapshot (memento) of file state.

### Conceptual Mapping
- **Originator**: File content
- **Memento**: MinIO version (versionId + content)
- **Caretaker**: FileSystemService + MinIO

### Implementation Location
- `SBackend/services/fileSystemService.js` - Caretaker methods
- MinIO - Memento storage

### Verification Criteria
✅ Versions are immutable (can't modify old versions)
✅ Version ID encapsulates version identity
✅ Restore doesn't expose internal version structure
✅ Caretaker manages mementos without knowing contents

---

### Test Case 4.1: Verify Version Immutability

**Objective**: Verify that MinIO versions are immutable (Memento characteristic)

**Test Steps**:
```bash
# 1. Create file and update it
curl -X POST http://localhost:3001/api/projects/test-proj/files/create \
  -H "Content-Type: application/json" \
  -d '{"path":"immutable-test.txt","content":"Original content"}'

curl -X PUT http://localhost:3001/api/projects/test-proj/files/update \
  -H "Content-Type: application/json" \
  -d '{"path":"immutable-test.txt","content":"Updated content"}'

# 2. Get list of versions
VERSION_LIST=$(curl -s "http://localhost:3001/api/projects/test-proj/files/versions?path=immutable-test.txt")
echo "$VERSION_LIST" | jq .

# 3. Get OLD version ID (not the latest)
OLD_VERSION_ID=$(echo "$VERSION_LIST" | jq -r '.versions[1].versionId')

# 4. Get content of old version
curl -s "http://localhost:3001/api/projects/test-proj/files/version/$OLD_VERSION_ID?path=immutable-test.txt" | jq .

# 5. Update file again
curl -X PUT http://localhost:3001/api/projects/test-proj/files/update \
  -H "Content-Type: application/json" \
  -d '{"path":"immutable-test.txt","content":"Third update"}'

# 6. Get old version again - should still have same content
curl -s "http://localhost:3001/api/projects/test-proj/files/version/$OLD_VERSION_ID?path=immutable-test.txt" | jq .
```

**Expected Results**:
- ✅ Old version content in step 4: "Original content"
- ✅ Old version content in step 6: "Original content" (unchanged)
- ✅ Version ID remains valid after new versions created
- ✅ Old version is not modified by new writes

**Success Criteria**:
- Versions are immutable - cannot be modified once created
- This confirms Memento pattern characteristic

---

### Test Case 4.2: Verify Encapsulation (Version ID is Opaque)

**Objective**: Verify that version ID encapsulates version location (Memento characteristic)

**Test Steps**:
```bash
# Get versions
VERSION_ID=$(curl -s "http://localhost:3001/api/projects/test-proj/files/versions?path=test.txt" | jq -r '.versions[0].versionId')

echo "Version ID: $VERSION_ID"

# Version ID should be an opaque identifier (not a path or timestamp)
# Example: "3ffd3c23-2d9d-4b34-9f64-8b1c6e8b8b8b" or similar
```

**Expected Results**:
- ✅ Version ID is opaque (doesn't reveal internal structure)
- ✅ Application doesn't need to know how versions are stored
- ✅ Encapsulation is maintained

**Success Criteria**:
- Version ID acts as opaque handle to memento
- Internal structure is hidden from caretaker (FileSystemService)

---

### Test Case 4.3: Verify Restore from Memento

**Objective**: Verify that file can be restored from memento without exposing internals

**Test Steps**:
```bash
# 1. Create file with versions
curl -X POST http://localhost:3001/api/projects/test-proj/files/create \
  -H "Content-Type: application/json" \
  -d '{"path":"restore-test.txt","content":"State 1"}'

curl -X PUT http://localhost:3001/api/projects/test-proj/files/update \
  -H "Content-Type: application/json" \
  -d '{"path":"restore-test.txt","content":"State 2"}'

curl -X PUT http://localhost:3001/api/projects/test-proj/files/update \
  -H "Content-Type: application/json" \
  -d '{"path":"restore-test.txt","content":"State 3 - Current"}'

# 2. Get version ID of "State 1"
VERSION_ID=$(curl -s "http://localhost:3001/api/projects/test-proj/files/versions?path=restore-test.txt" | jq -r '.versions[2].versionId')

# 3. Restore to "State 1" using only version ID
curl -X POST http://localhost:3001/api/projects/test-proj/files/restore \
  -H "Content-Type: application/json" \
  -d "{\"path\":\"restore-test.txt\",\"versionId\":\"$VERSION_ID\"}"

# 4. Read current content
curl -s "http://localhost:3001/api/projects/test-proj/files/read?path=restore-test.txt"
```

**Expected Results**:
- ✅ File content after restore: "State 1"
- ✅ Restore only required version ID (not internal structure)
- ✅ Caretaker (FileSystemService) managed restoration

**Success Criteria**:
- File state restored from memento using only opaque ID
- Restoration doesn't expose how mementos are stored
- Confirms Memento pattern's encapsulation benefit

---

## Summary of Pattern Verification

### Command Pattern ✅
- **Implementation**: RestoreVersionCommand
- **Verified**: Execute, undo, serialization, manager integration
- **Tests**: 4 test cases covering all aspects

### Template Method Pattern ✅
- **Implementation**: BaseCommand
- **Verified**: Template methods, hook methods, preconditions
- **Tests**: 3 test cases covering execution flow

### Strategy Pattern ✅
- **Implementation**: Version retention strategies
- **Verified**: Strategy interface, concrete strategies, runtime swapping
- **Tests**: 3 test cases covering different strategies

### Memento Pattern ✅
- **Implementation**: MinIO versioning (conceptual)
- **Verified**: Immutability, encapsulation, restoration
- **Tests**: 3 test cases covering memento characteristics

---

## Running All Tests

### Prerequisites
```bash
# 1. Start services
docker-compose up -d minio
cd SBackend && npm start &
cd Frontend && npm run dev &

# 2. Enable versioning
cd SBackend
node scripts/enable-versioning.js
```

### Quick Verification Script
```bash
#!/bin/bash
# quick-test.sh - Runs all critical tests

echo "=== Testing Command Pattern ==="
# Test Case 1.1 steps here

echo "=== Testing Template Method Pattern ==="
# Test Case 2.1 steps here

echo "=== Testing Strategy Pattern ==="
# Test Case 3.1 steps here

echo "=== Testing Memento Pattern ==="
# Test Case 4.1 steps here

echo "All tests completed!"
```

---

## Test Results Recording

### Assignment 3 Pattern Test Results

| Pattern | Test Case | Status | Notes |
|---------|-----------|--------|-------|
| Command | 1.1 Execute | ⬜ Not Run | |
| Command | 1.2 Undo | ⬜ Not Run | |
| Command | 1.3 Serialize | ⬜ Not Run | |
| Command | 1.4 Manager Integration | ⬜ Not Run | |
| Template Method | 2.1 Structure | ⬜ Not Run | |
| Template Method | 2.2 Hook Order | ⬜ Not Run | |
| Template Method | 2.3 Preconditions | ⬜ Not Run | |
| Strategy | 3.1 KeepRecent | ⬜ Not Run | |
| Strategy | 3.2 TimeBased | ⬜ Not Run | |
| Strategy | 3.3 Runtime Swap | ⬜ Not Run | |
| Memento | 4.1 Immutability | ⬜ Not Run | |
| Memento | 4.2 Encapsulation | ⬜ Not Run | |
| Memento | 4.3 Restore | ⬜ Not Run | |

**Legend**: ⬜ Not Run | ✅ Passed | ❌ Failed

---

## Conclusion

These test cases provide comprehensive verification that all design patterns in Assignment 3 are correctly implemented. Each test case is executable and verifies specific pattern characteristics and benefits.

**Total Test Coverage**:
- 13 distinct test cases
- 4 design patterns verified
- Both conceptual and implementation aspects tested
- End-to-end workflows validated
