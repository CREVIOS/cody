/**
 * Command Manager
 *
 * Manages command history and provides undo/redo functionality.
 * This is the Invoker in the Command pattern.
 *
 * Features:
 * - Undo/redo stacks with maximum size limits
 * - Event notifications when stack state changes
 * - Command history for audit trail
 * - Serialization for persistence
 */

import { Command, CommandData } from './Command';
import { eventBus, EventType } from '../events/EventBus';

export class CommandManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxStackSize = 100; // Prevent memory leaks
  private isProcessing = false; // Prevent concurrent operations

  /**
   * Execute a command and add it to the undo stack
   *
   * @param command - Command to execute
   * @throws Error if command execution fails
   */
  async execute(command: Command): Promise<void> {
    try {
      await command.execute();

      // Only add to undo stack if the command can be undone
      // This prevents adding commands that will fail on undo
      if (command.canUndo()) {
        this.undoStack.push(command);

        // Clear redo stack (new action invalidates redo history)
        this.redoStack = [];

        // Limit stack size to prevent memory leaks
        if (this.undoStack.length > this.maxStackSize) {
          this.undoStack.shift(); // Remove oldest command
        }
      }

      // Emit event for UI update (even if command can't be undone)
      this.emitStateChange();

    } catch (error) {
      console.error('Command execution failed:', error);
      throw error;
    }
  }

  /**
   * Undo the last command
   *
   * @throws Error if nothing to undo or undo fails
   */
  async undo(): Promise<void> {
    // Prevent concurrent operations
    if (this.isProcessing) {
      throw new Error('Another operation is in progress');
    }

    this.isProcessing = true;
    try {
      const command = this.undoStack.pop();
      if (!command) {
        throw new Error('Nothing to undo');
      }

      if (!command.canUndo()) {
        // Put it back on the stack
        this.undoStack.push(command);
        throw new Error(`Command "${command.getDescription()}" cannot be undone`);
      }

      try {
        await command.undo();
        this.redoStack.push(command);
        this.emitStateChange();
      } catch (error) {
        // Put command back on undo stack if undo fails
        this.undoStack.push(command);
        console.error('Undo failed:', error);
        throw error;
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Redo the last undone command
   *
   * @throws Error if nothing to redo or redo fails
   */
  async redo(): Promise<void> {
    // Prevent concurrent operations
    if (this.isProcessing) {
      throw new Error('Another operation is in progress');
    }

    this.isProcessing = true;
    try {
      const command = this.redoStack.pop();
      if (!command) {
        throw new Error('Nothing to redo');
      }

      try {
        await command.redo();
        this.undoStack.push(command);
        this.emitStateChange();
      } catch (error) {
        // Put command back on redo stack if redo fails
        this.redoStack.push(command);
        console.error('Redo failed:', error);
        throw error;
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Check if undo is possible
   */
  canUndo(): boolean {
    return this.undoStack.length > 0 &&
           (this.undoStack[this.undoStack.length - 1]?.canUndo() ?? false);
  }

  /**
   * Check if redo is possible
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get description of command that would be undone
   */
  getUndoDescription(): string | null {
    const command = this.undoStack[this.undoStack.length - 1];
    return command ? command.getDescription() : null;
  }

  /**
   * Get description of command that would be redone
   */
  getRedoDescription(): string | null {
    const command = this.redoStack[this.redoStack.length - 1];
    return command ? command.getDescription() : null;
  }

  /**
   * Clear all command history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emitStateChange();
  }

  /**
   * Get command history (for audit trail or debugging)
   */
  getHistory(): Command[] {
    return [...this.undoStack];
  }

  /**
   * Serialize command history for persistence
   *
   * This can be used to:
   * - Save audit log to database
   * - Recover from crashes
   * - Sync operations to other clients
   */
  serialize(): CommandData[] {
    return this.undoStack.map(cmd => cmd.serialize());
  }

  /**
   * Emit state change event for UI updates
   * @private
   */
  private emitStateChange(): void {
    const canUndo = this.canUndo();
    const canRedo = this.canRedo();

    eventBus.publish({
      type: EventType.PERMISSION_CHANGED, // Reusing existing event type
      timestamp: Date.now(),
      userId: '',
      projectId: '',
      permission: 'command_stack_changed',
      granted: canUndo,
      // Custom payload for command stack
      canUndo: canUndo,
      canRedo: canRedo,
      undoDescription: this.getUndoDescription(),
      redoDescription: this.getRedoDescription(),
    } as any);
  }
}

/**
 * Global singleton instance of CommandManager
 *
 * Usage:
 * ```typescript
 * import { commandManager } from '@/lib/commands/CommandManager';
 *
 * const command = new DeleteFileCommand(...);
 * await commandManager.execute(command);
 * ```
 */
export const commandManager = new CommandManager();
