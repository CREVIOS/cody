/**
 * Base Command Class
 *
 * Abstract base class that provides common functionality for all commands.
 * Implements the Template Method pattern: defines the skeleton of execute/undo/redo
 * and delegates the actual work to abstract methods.
 */

import { Command, CommandData } from './Command';

export abstract class BaseCommand implements Command {
  protected executed = false;
  protected timestamp: number;

  constructor(
    protected userId: string,
    protected projectId: string
  ) {
    this.timestamp = Date.now();
  }

  /**
   * Execute the command (Template Method pattern)
   *
   * This method orchestrates the execution and maintains state.
   * Subclasses implement doExecute() for the actual work.
   */
  async execute(): Promise<void> {
    if (this.executed) {
      throw new Error(`Command already executed: ${this.getDescription()}`);
    }
    await this.doExecute();
    this.executed = true;
  }

  /**
   * Undo the command (Template Method pattern)
   *
   * This method checks preconditions and delegates to doUndo().
   */
  async undo(): Promise<void> {
    if (!this.executed) {
      throw new Error(`Cannot undo command that hasn't been executed: ${this.getDescription()}`);
    }
    if (!this.canUndo()) {
      throw new Error(`Command cannot be undone: ${this.getDescription()}`);
    }
    await this.doUndo();
    this.executed = false;
  }

  /**
   * Redo the command (Template Method pattern)
   *
   * Redo is the same as execute for most commands.
   */
  async redo(): Promise<void> {
    if (this.executed) {
      throw new Error(`Command already executed: ${this.getDescription()}`);
    }
    await this.doExecute();
    this.executed = true;
  }

  // Subclasses must implement these methods
  protected abstract doExecute(): Promise<void>;
  protected abstract doUndo(): Promise<void>;

  // Subclasses must implement these
  abstract getDescription(): string;
  abstract canUndo(): boolean;
  abstract serialize(): CommandData;

  /**
   * Helper: Get timestamp as ISO string
   */
  protected getTimestampISO(): string {
    return new Date(this.timestamp).toISOString();
  }
}
