/**
 * CommandManager Unit Tests
 * 
 * Tests the CommandManager class which is the Invoker in the Command pattern.
 * Verifies undo/redo functionality, stack management, event notifications, and error handling.
 */

import { CommandManager } from '../app/lib/commands/CommandManager';
import { Command, CommandData } from '../app/lib/commands/Command';
import { eventBus, EventType } from '../app/lib/events/EventBus';

// Mock command for testing
class MockCommand implements Command {
  private executed = false;
  private undone = false;
  private redone = false;

  constructor(
    private description: string,
    private canUndoValue: boolean = true,
    private shouldFailExecute: boolean = false,
    private shouldFailUndo: boolean = false,
    private shouldFailRedo: boolean = false
  ) {}

  async execute(): Promise<void> {
    if (this.shouldFailExecute) {
      throw new Error('Execute failed');
    }
    this.executed = true;
    this.undone = false;
    this.redone = false;
  }

  async undo(): Promise<void> {
    if (this.shouldFailUndo) {
      throw new Error('Undo failed');
    }
    if (!this.executed) {
      throw new Error('Cannot undo: command not executed');
    }
    this.undone = true;
    this.executed = false;
  }

  async redo(): Promise<void> {
    if (this.shouldFailRedo) {
      throw new Error('Redo failed');
    }
    if (this.executed) {
      throw new Error('Cannot redo: command already executed');
    }
    this.redone = true;
    this.executed = true;
    this.undone = false;
  }

  getDescription(): string {
    return this.description;
  }

  canUndo(): boolean {
    return this.canUndoValue;
  }

  serialize(): CommandData {
    return {
      type: 'MOCK_COMMAND',
      timestamp: Date.now(),
      userId: 'test-user',
      projectId: 'test-project',
      metadata: { description: this.description },
    };
  }

  // Test helpers
  isExecuted(): boolean {
    return this.executed;
  }

  isUndone(): boolean {
    return this.undone;
  }

  isRedone(): boolean {
    return this.redone;
  }
}

describe('CommandManager', () => {
  let manager: CommandManager;
  let eventHandler: jest.Mock;

  beforeEach(() => {
    manager = new CommandManager();
    eventHandler = jest.fn();
    eventBus.subscribe(EventType.PERMISSION_CHANGED, eventHandler);
    eventBus.clearHistory();
  });

  afterEach(() => {
    eventBus.clearAllSubscriptions();
    eventBus.clearHistory();
  });

  describe('Command Execution', () => {
    it('should execute a command successfully', async () => {
      const command = new MockCommand('Test command');
      
      await manager.execute(command);

      expect(command.isExecuted()).toBe(true);
      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(false);
    });

    it('should add command to undo stack after execution', async () => {
      const command = new MockCommand('Test command');
      
      await manager.execute(command);

      expect(manager.canUndo()).toBe(true);
      expect(manager.getUndoDescription()).toBe('Test command');
    });

    it('should clear redo stack when new command is executed', async () => {
      const command1 = new MockCommand('Command 1');
      const command2 = new MockCommand('Command 2');

      await manager.execute(command1);
      await manager.undo();
      expect(manager.canRedo()).toBe(true);

      await manager.execute(command2);
      expect(manager.canRedo()).toBe(false);
      expect(manager.canUndo()).toBe(true);
    });

    it('should not add non-undoable commands to undo stack', async () => {
      const command = new MockCommand('Non-undoable', false);
      
      await manager.execute(command);

      expect(command.isExecuted()).toBe(true);
      expect(manager.canUndo()).toBe(false);
    });

    it('should throw error if command execution fails', async () => {
      const command = new MockCommand('Failing command', true, true);

      await expect(manager.execute(command)).rejects.toThrow('Execute failed');
      expect(manager.canUndo()).toBe(false);
    });

    it('should emit state change event after execution', async () => {
      const command = new MockCommand('Test command');
      
      await manager.execute(command);

      expect(eventHandler).toHaveBeenCalled();
      const event = eventHandler.mock.calls[0][0];
      expect(event.permission).toBe('command_stack_changed');
      expect(event.canUndo).toBe(true);
      expect(event.canRedo).toBe(false);
    });
  });

  describe('Undo Functionality', () => {
    it('should undo the last command', async () => {
      const command = new MockCommand('Test command');
      
      await manager.execute(command);
      await manager.undo();

      expect(command.isUndone()).toBe(true);
      expect(manager.canUndo()).toBe(false);
      expect(manager.canRedo()).toBe(true);
    });

    it('should throw error if nothing to undo', async () => {
      await expect(manager.undo()).rejects.toThrow('Nothing to undo');
    });

    it('should throw error if trying to undo non-undoable command', async () => {
      const command = new MockCommand('Non-undoable', false);
      
      await manager.execute(command);
      // Non-undoable commands are not added to undo stack, so there's nothing to undo
      await expect(manager.undo()).rejects.toThrow('Nothing to undo');
    });

    it('should restore command to undo stack if undo fails', async () => {
      const command = new MockCommand('Failing undo', true, false, true);
      
      await manager.execute(command);
      expect(manager.canUndo()).toBe(true);

      await expect(manager.undo()).rejects.toThrow('Undo failed');
      expect(manager.canUndo()).toBe(true); // Command should be back on stack
    });

    it('should prevent concurrent undo operations', async () => {
      const command = new MockCommand('Test command');
      await manager.execute(command);

      // Start first undo (will be slow)
      const undo1 = manager.undo();

      // Try second undo immediately
      await expect(manager.undo()).rejects.toThrow('Another operation is in progress');

      // Complete first undo
      await undo1;
    });

    it('should emit state change event after undo', async () => {
      const command = new MockCommand('Test command');
      
      await manager.execute(command);
      eventHandler.mockClear();
      
      await manager.undo();

      expect(eventHandler).toHaveBeenCalled();
      const event = eventHandler.mock.calls[0][0];
      expect(event.canUndo).toBe(false);
      expect(event.canRedo).toBe(true);
    });
  });

  describe('Redo Functionality', () => {
    it('should redo the last undone command', async () => {
      const command = new MockCommand('Test command');
      
      await manager.execute(command);
      await manager.undo();
      await manager.redo();

      expect(command.isRedone()).toBe(true);
      expect(command.isExecuted()).toBe(true);
      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(false);
    });

    it('should throw error if nothing to redo', async () => {
      await expect(manager.redo()).rejects.toThrow('Nothing to redo');
    });

    it('should restore command to redo stack if redo fails', async () => {
      const command = new MockCommand('Failing redo', true, false, false, true);
      
      await manager.execute(command);
      await manager.undo();
      expect(manager.canRedo()).toBe(true);

      await expect(manager.redo()).rejects.toThrow('Redo failed');
      expect(manager.canRedo()).toBe(true); // Command should be back on stack
    });

    it('should prevent concurrent redo operations', async () => {
      const command = new MockCommand('Test command');
      await manager.execute(command);
      await manager.undo();

      // Start first redo (will be slow)
      const redo1 = manager.redo();

      // Try second redo immediately
      await expect(manager.redo()).rejects.toThrow('Another operation is in progress');

      // Complete first redo
      await redo1;
    });

    it('should emit state change event after redo', async () => {
      const command = new MockCommand('Test command');
      
      await manager.execute(command);
      await manager.undo();
      eventHandler.mockClear();
      
      await manager.redo();

      expect(eventHandler).toHaveBeenCalled();
      const event = eventHandler.mock.calls[0][0];
      expect(event.canUndo).toBe(true);
      expect(event.canRedo).toBe(false);
    });
  });

  describe('Stack Management', () => {
    it('should limit undo stack size to prevent memory leaks', async () => {
      // Create more commands than maxStackSize (100)
      const commands: MockCommand[] = [];
      for (let i = 0; i < 105; i++) {
        commands.push(new MockCommand(`Command ${i}`));
        await manager.execute(commands[i]);
      }

      // Oldest commands should be removed
      const history = manager.getHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });

    it('should maintain correct order in undo stack', async () => {
      const commands = [
        new MockCommand('Command 1'),
        new MockCommand('Command 2'),
        new MockCommand('Command 3'),
      ];

      for (const cmd of commands) {
        await manager.execute(cmd);
      }

      // Undo should reverse order
      expect(manager.getUndoDescription()).toBe('Command 3');
      await manager.undo();
      expect(manager.getUndoDescription()).toBe('Command 2');
      await manager.undo();
      expect(manager.getUndoDescription()).toBe('Command 1');
    });

    it('should clear both stacks when clear() is called', async () => {
      const command1 = new MockCommand('Command 1');
      const command2 = new MockCommand('Command 2');

      await manager.execute(command1);
      await manager.execute(command2);
      await manager.undo();

      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(true);

      manager.clear();

      expect(manager.canUndo()).toBe(false);
      expect(manager.canRedo()).toBe(false);
      expect(manager.getHistory()).toEqual([]);
    });
  });

  describe('History and Serialization', () => {
    it('should return command history', async () => {
      const commands = [
        new MockCommand('Command 1'),
        new MockCommand('Command 2'),
        new MockCommand('Command 3'),
      ];

      for (const cmd of commands) {
        await manager.execute(cmd);
      }

      const history = manager.getHistory();
      expect(history.length).toBe(3);
      expect(history[0].getDescription()).toBe('Command 1');
      expect(history[2].getDescription()).toBe('Command 3');
    });

    it('should serialize command history', async () => {
      const commands = [
        new MockCommand('Command 1'),
        new MockCommand('Command 2'),
      ];

      for (const cmd of commands) {
        await manager.execute(cmd);
      }

      const serialized = manager.serialize();
      expect(serialized.length).toBe(2);
      expect(serialized[0].type).toBe('MOCK_COMMAND');
      expect(serialized[0].metadata.description).toBe('Command 1');
    });

    it('should return empty history when no commands executed', () => {
      expect(manager.getHistory()).toEqual([]);
      expect(manager.serialize()).toEqual([]);
    });
  });

  describe('Description Methods', () => {
    it('should return undo description', async () => {
      const command = new MockCommand('Test command');
      await manager.execute(command);

      expect(manager.getUndoDescription()).toBe('Test command');
    });

    it('should return null undo description when stack is empty', () => {
      expect(manager.getUndoDescription()).toBeNull();
    });

    it('should return redo description', async () => {
      const command = new MockCommand('Test command');
      await manager.execute(command);
      await manager.undo();

      expect(manager.getRedoDescription()).toBe('Test command');
    });

    it('should return null redo description when stack is empty', () => {
      expect(manager.getRedoDescription()).toBeNull();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple undo/redo cycles', async () => {
      const commands = [
        new MockCommand('Command 1'),
        new MockCommand('Command 2'),
        new MockCommand('Command 3'),
      ];

      // Execute all
      for (const cmd of commands) {
        await manager.execute(cmd);
      }

      // Undo all
      await manager.undo();
      await manager.undo();
      await manager.undo();

      expect(manager.canUndo()).toBe(false);
      expect(manager.canRedo()).toBe(true);

      // Redo all
      await manager.redo();
      await manager.redo();
      await manager.redo();

      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(false);
    });

    it('should handle interleaved execute/undo/redo', async () => {
      const cmd1 = new MockCommand('Command 1');
      const cmd2 = new MockCommand('Command 2');
      const cmd3 = new MockCommand('Command 3');

      await manager.execute(cmd1);
      await manager.execute(cmd2);
      await manager.undo(); // Undo cmd2
      await manager.execute(cmd3); // This should clear redo stack

      expect(manager.canRedo()).toBe(false);
      expect(manager.canUndo()).toBe(true);
      expect(manager.getUndoDescription()).toBe('Command 3');
    });
  });
});

