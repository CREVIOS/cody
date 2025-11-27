# Assignment 3: Feature Proposal
## File Version History & Recovery System

**Project**: Collaborative Code Editor with RBAC
**Feature**: Automatic file versioning with recovery capabilities
**Date**: January 2025
**Team Members**: [Your Names]

---

## 1. Feature Overview

### Problem Statement
In collaborative code editing environments, developers frequently face challenges such as:
- **Accidental deletions** of critical code files
- **Loss of work** due to overwriting changes
- **Inability to track** who changed what and when
- **Difficulty reverting** to stable versions after failed experiments

Without version control at the file level, teams risk losing hours of work and cannot easily recover from mistakes.

### Proposed Solution
Implement an **automated file version history and recovery system** that:
1. **Automatically creates versions** every time a file is saved (using MinIO built-in versioning)
2. **Provides UI timeline view** showing all historical versions of any file
3. **Enables one-click restore** to any previous version
4. **Supports undoable operations** through command pattern integration
5. **Implements smart cleanup** using configurable retention policies

---

## 2. Use Cases

### UC1: Recover from Accidental Deletion
**Actor**: Developer
**Precondition**: File versioning is enabled on the project
**Flow**:
1. Developer accidentally deletes a critical component file
2. Developer opens the file's version history panel
3. System displays timeline of all previous versions with timestamps
4. Developer selects version from before deletion
5. Developer clicks "Restore" button
6. System restores file content and creates new version
7. File reappears in editor with previous content

**Postcondition**: File is recovered, work is not lost
**Business Value**: Saves hours of re-implementation time, reduces stress

### UC2: Compare Changes Over Time
**Actor**: Team Lead
**Precondition**: Multiple developers have edited the same file
**Flow**:
1. Team lead suspects a bug was introduced in recent changes
2. Opens version history for the problematic file
3. Clicks through historical versions to preview content
4. Identifies the exact version where bug was introduced
5. Notes the timestamp and reviews who made the change

**Postcondition**: Root cause identified
**Business Value**: Faster debugging, improved code quality

### UC3: Experiment with Confidence
**Actor**: Developer
**Precondition**: Developer wants to try risky refactoring
**Flow**:
1. Developer notes current stable version timestamp
2. Proceeds with experimental refactoring
3. After testing, realizes old approach was better
4. Opens version history
5. Restores to noted stable version
6. Continues work from stable state

**Postcondition**: Developer can experiment without fear
**Business Value**: Encourages innovation, faster iteration

### UC4: Automated Cleanup (System Use Case)
**Actor**: System (Scheduled Task)
**Precondition**: Retention policy configured for project
**Flow**:
1. Nightly cleanup job runs
2. For each file, system lists all versions
3. Applies configured retention strategy (e.g., keep last 10 versions)
4. Deletes versions that don't match strategy
5. Logs deletion summary

**Postcondition**: Storage optimized
**Business Value**: Controls storage costs, maintains performance

---

## 3. Planned Design Patterns

This feature demonstrates **multiple design patterns working together** to create an extensible, maintainable solution:

### Pattern 1: **Command Pattern** (Primary)
**Purpose**: Encapsulate restore operations as undoable commands

**Implementation**:
- `RestoreVersionCommand` extends `BaseCommand`
- Implements `doExecute()`, `doUndo()` hook methods
- Stores `previousContent` and `previousVersionId` for undo capability
- Uses `VersionService` interface for backend communication
- Integrates with existing `CommandManager` (max 100 commands in stack)

**Why this pattern?**
- Enables undo/redo for version restore operations
- Provides consistent interface with other file operations
- Supports command history for audit trails
- Decouples command from API implementation via `VersionService` interface

**Code Evidence**:
```typescript
// Frontend/app/lib/commands/RestoreVersionCommand.ts
export class RestoreVersionCommand extends BaseCommand {
  private previousContent: string | null = null;
  private previousVersionId: string | null = null;
  
  protected async doExecute(): Promise<void> {
    // 1. Get current version ID before restoring
    const versions = await this.versionService.listFileVersions(...);
    this.previousVersionId = versions.find(v => v.isLatest)?.versionId;
    
    // 2. Save current content for undo
    this.previousContent = await this.versionService.getCurrentFileContent(...);
    
    // 3. Restore to target version
    await this.versionService.restoreFileVersion(..., this.targetVersionId);
  }

  protected async doUndo(): Promise<void> {
    // Restore to previous version ID
    await this.versionService.restoreFileVersion(..., this.previousVersionId);
  }
}
```

### Pattern 2: **Template Method Pattern** (Structural)
**Purpose**: Define skeleton of command execution with customizable steps

**Implementation**:
- `BaseCommand` defines template: `execute() → doExecute()`
- Subclasses implement `doExecute()`, `doUndo()` hooks
- Template handles state management (executed flag, timestamps)

**Why this pattern?**
- Ensures all commands follow same execution flow
- Reduces code duplication across command types
- Makes adding new commands straightforward

**Code Evidence**:
```typescript
// Frontend/app/lib/commands/BaseCommand.ts
abstract class BaseCommand {
  async execute() {  // Template method
    if (this.executed) throw new Error('Already executed');
    await this.doExecute();  // Hook for subclasses
    this.executed = true;
  }

  protected abstract doExecute(): Promise<void>;  // Hook
}
```

### Pattern 3: **Strategy Pattern** (Behavioral)
**Purpose**: Enable runtime selection of version retention policies

**Implementation**:
- `IRetentionStrategy` abstract class defines `filterVersionsToKeep()` and `getName()`
- `KeepRecentVersionsStrategy`: Keep N most recent versions
- `TimeBasedRetentionStrategy`: Keep all from last 24h, 1/day for 7 days, 1/week for 30 days
- `TaggedVersionsStrategy`: Keep tagged/release versions only
- `VersionRetentionManager` uses strategies interchangeably and can swap at runtime

**Why this pattern?**
- Different projects need different retention policies
- Can switch strategies without changing manager code
- Easy to add new retention strategies

**Code Evidence**:
```javascript
// SBackend/services/versionRetentionStrategies.js
class VersionRetentionManager {
  setStrategy(strategy) {  // Runtime strategy change
    this.strategy = strategy;
  }

  async applyRetentionPolicy(projectId, filePath) {
    const versionsToKeep = this.strategy.filterVersionsToKeep(versions);
    // Delete versions not in keep list
  }
}

// Usage:
manager.setStrategy(new KeepRecentVersionsStrategy(10));
manager.setStrategy(new TimeBasedRetentionStrategy({ keepAllHours: 24 }));
```

### Pattern 4: **Memento Pattern** (Conceptual)
**Purpose**: Capture and externalize file state without violating encapsulation

**Implementation**:
- MinIO versions serve as **mementos** of file state
- Each version is immutable snapshot with unique version ID
- `FileSystemService` acts as **caretaker**, managing mementos
- File content is the **originator**, restored from mementos

**Why this pattern?**
- Versions are immutable (can't modify old versions)
- Version ID encapsulates version location/identity
- Restore doesn't expose internal version storage details

**Conceptual Mapping**:
```
Memento Pattern Role     → Our Implementation
----------------------     -------------------
Originator               → File content
Memento                  → MinIO version (versionId + content)
Caretaker                → FileSystemService + MinIO
```

---

## 4. Technical Architecture

### Components Interaction
```
┌─────────────────────────────────────────────────────────┐
│ Frontend (TypeScript/React)                             │
│  ┌──────────────────────┐    ┌─────────────────────┐   │
│  │ VersionHistoryPanel  │    │ RestoreVersionCmd   │   │
│  │ - Timeline UI        │───▶│ - Command Pattern   │   │
│  │ - Version list       │    │ - Undo/Redo support │   │
│  └──────────────────────┘    └─────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                  │
                  │ REST API
                  ▼
┌─────────────────────────────────────────────────────────┐
│ SBackend (Node.js/Express)                              │
│  ┌───────────────────────┐  ┌──────────────────────┐   │
│  │ FileSystemService     │  │ RetentionManager     │   │
│  │ - listVersions()      │  │ - Strategy Pattern   │   │
│  │ - getVersion()        │  │ - Policy enforcement │   │
│  │ - restoreVersion()    │  └──────────────────────┘   │
│  └───────────────────────┘                              │
└─────────────────────────────────────────────────────────┘
                  │
                  │ MinIO SDK
                  ▼
┌─────────────────────────────────────────────────────────┐
│ MinIO (S3-Compatible Object Storage)                    │
│  Bucket: 'projects'                                     │
│  Versioning: ENABLED                                    │
│  - Automatic version ID generation                      │
│  - Immutable version storage                            │
│  - Delete markers for recovery                          │
└─────────────────────────────────────────────────────────┘
```

### API Endpoints
- `GET /api/projects/:id/files/versions?path=...` - List versions
- `GET /api/projects/:id/files/version/:versionId?path=...` - Get version content
- `POST /api/projects/:id/files/restore` - Restore version
- `POST /api/versioning/enable` - Enable versioning

---

## 5. Benefits & Impact

### Development Team Benefits
- ✅ **Zero-fear editing**: Developers can experiment knowing they can undo
- ✅ **Fast recovery**: Restore files in seconds vs hours of rewriting
- ✅ **Better debugging**: See exact changes that introduced bugs
- ✅ **Audit trail**: Track who changed what and when

### Technical Benefits
- ✅ **Production-ready**: Uses MinIO's battle-tested versioning
- ✅ **Extensible**: Easy to add new retention strategies
- ✅ **Maintainable**: Clear pattern separation, low coupling
- ✅ **Testable**: Each pattern component can be unit tested

### Business Benefits
- ✅ **Reduced downtime**: Faster recovery from mistakes
- ✅ **Cost control**: Automated cleanup manages storage costs
- ✅ **Developer productivity**: Less time fixing, more time building
- ✅ **Code quality**: Encourages experimentation and refactoring

---

## 6. Implementation Approach

### Phase 1: Enable MinIO Versioning ✅
- Run setup script to enable bucket versioning
- Verify automatic version creation on file updates

### Phase 2: Backend API ✅
- Implement version management methods in FileSystemService
- Create RESTful endpoints for version operations
- Add retention strategy classes

### Phase 3: Frontend UI ✅
- Build VersionHistoryPanel component
- Integrate with existing file editor
- Create RestoreVersionCommand

### Phase 4: Testing & Documentation ✅
- Test version creation, restoration, cleanup
- Document setup and usage
- Create UML diagrams for assignment

---

## 7. Success Criteria

This feature will be considered successful when:
1. ✅ Versions are **automatically created** on every file save
2. ✅ Users can **view version history** through intuitive UI
3. ✅ Restore operations are **undoable** via command pattern
4. ✅ Retention policies **automatically clean up** old versions
5. ✅ All operations have **<200ms response time**
6. ✅ System demonstrates **4+ design patterns** working together

---

## 8. Pattern Integration Summary

| Pattern | Role | Interaction |
|---------|------|-------------|
| **Command** | Encapsulate restore | Calls Strategy to determine what to restore |
| **Template Method** | Define execution flow | Used by Command for consistent behavior |
| **Strategy** | Select retention policy | Provides versions list to Command/Memento |
| **Memento** | Store file snapshots | Versions managed by Strategy, used by Command |

These patterns work together seamlessly:
- **Command** uses **Memento** to get previous state
- **Strategy** determines which **Mementos** to keep
- **Template Method** ensures all **Commands** execute consistently

---

**This feature provides significant value to the collaborative editing platform while demonstrating advanced software engineering principles through proper application of design patterns.**
