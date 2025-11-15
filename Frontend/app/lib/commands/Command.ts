/**
 * Command Pattern Implementation
 *
 * This module implements the Command design pattern for file system operations.
 * The Command pattern encapsulates requests as objects, enabling:
 * - Undo/redo of operations
 * - Queueing of operations (offline support)
 * - Macro recording (batch operations)
 * - Audit logging (operation history)
 *
 * Design Pattern: Command
 * Purpose: Encapsulate file operations as objects to support undo/redo
 * Benefits:
 *   - Undo/redo: Users can reverse accidental deletions or changes
 *   - History: Track all file operations for auditing
 *   - Queueing: Operations can be queued for offline execution
 *   - Macro: Multiple operations can be combined
 */

/**
 * Metadata stored with each command for auditing and serialization
 */
export interface CommandData {
  type: string;
  timestamp: number;
  userId: string;
  projectId: string;
  metadata: Record<string, any>;
}

/**
 * Command interface - all file operations must implement this
 *
 * This follows the Command pattern's standard structure:
 * - execute(): Perform the operation
 * - undo(): Reverse the operation
 * - redo(): Re-perform the operation after undo
 */
export interface Command {
  /**
   * Execute the command
   * @throws Error if command cannot be executed
   */
  execute(): Promise<void>;

  /**
   * Undo the command (reverse the operation)
   * @throws Error if command cannot be undone
   */
  undo(): Promise<void>;

  /**
   * Redo the command (re-execute after undo)
   * @throws Error if command cannot be redone
   */
  redo(): Promise<void>;

  /**
   * Get human-readable description for UI (e.g., "Delete file app.tsx")
   */
  getDescription(): string;

  /**
   * Whether this command can be undone
   *
   * Some operations like "save" may not be undoable.
   * Research shows: "It makes no sense to undo a save file operation"
   */
  canUndo(): boolean;

  /**
   * Serialize command for persistence/logging
   *
   * This enables:
   * - Audit trail: Save all operations to database
   * - Crash recovery: Replay operations after crash
   * - Sync: Send operations to other clients
   */
  serialize(): CommandData;
}
