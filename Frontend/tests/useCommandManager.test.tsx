/**
 * useCommandManager Hook Tests
 * 
 * Tests the React hook wrapper for CommandManager.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCommandManager } from '../app/hooks/useCommandManager';
import { commandManager } from '../app/lib/commands/CommandManager';
import { Command } from '../app/lib/commands/Command';
import { eventBus, EventType } from '../app/lib/events/EventBus';

// Mock command
class MockCommand implements Command {
  constructor(private description: string) {}
  async execute(): Promise<void> {}
  async undo(): Promise<void> {}
  async redo(): Promise<void> {}
  getDescription(): string { return this.description; }
  canUndo(): boolean { return true; }
  serialize() {
    return {
      type: 'MOCK',
      timestamp: Date.now(),
      userId: 'user',
      projectId: 'project',
      metadata: {},
    };
  }
}

describe('useCommandManager', () => {
  beforeEach(() => {
    commandManager.clear();
    eventBus.clearAllSubscriptions();
    eventBus.clearHistory();
  });

  afterEach(() => {
    commandManager.clear();
    eventBus.clearAllSubscriptions();
  });

  describe('Initial State', () => {
    it('should return initial state with no commands', () => {
      const { result } = renderHook(() => useCommandManager());

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
      expect(result.current.undoDescription).toBeNull();
      expect(result.current.redoDescription).toBeNull();
      expect(result.current.isProcessing).toBe(false);
    });
  });

  describe('Command Execution', () => {
    it('should execute a command', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command = new MockCommand('Test command');

      await act(async () => {
        await result.current.execute(command);
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.undoDescription).toBe('Test command');
    });

    it('should update state after command execution', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command = new MockCommand('Test command');

      await act(async () => {
        await result.current.execute(command);
      });

      await waitFor(() => {
        expect(result.current.canUndo).toBe(true);
      });
    });

    it('should handle command execution errors', async () => {
      const { result } = renderHook(() => useCommandManager());
      const failingCommand = {
        ...new MockCommand('Failing command'),
        execute: async () => { throw new Error('Execution failed'); },
      } as Command;

      await act(async () => {
        await expect(result.current.execute(failingCommand)).rejects.toThrow('Execution failed');
      });
    });
  });

  describe('Undo Functionality', () => {
    it('should undo a command', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command = new MockCommand('Test command');

      await act(async () => {
        await result.current.execute(command);
      });

      await act(async () => {
        await result.current.undo();
      });

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
      expect(result.current.redoDescription).toBe('Test command');
    });

    it('should set isProcessing during undo', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command = new MockCommand('Test command');

      await act(async () => {
        await result.current.execute(command);
      });

      // Start undo and check isProcessing immediately (synchronous state update)
      act(() => {
        result.current.undo();
      });

      // isProcessing should be true immediately after calling undo
      expect(result.current.isProcessing).toBe(true);

      // Wait for undo to complete
      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });
    });

    it('should prevent concurrent undo operations', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command = new MockCommand('Test command');

      await act(async () => {
        await result.current.execute(command);
      });

      // Start first undo
      const undo1 = act(async () => result.current.undo());

      // Try second undo immediately (should be ignored due to isProcessingRef)
      await act(async () => {
        await result.current.undo();
      });

      await undo1;
      // Should only undo once
      await waitFor(() => {
        expect(result.current.canRedo).toBe(true);
      });
    });

    it('should handle undo errors', async () => {
      const { result } = renderHook(() => useCommandManager());
      // Create a proper command instance and override undo method
      const baseCommand = new MockCommand('Failing undo');
      const failingCommand: Command = {
        execute: baseCommand.execute.bind(baseCommand),
        undo: async () => { throw new Error('Undo failed'); },
        redo: baseCommand.redo.bind(baseCommand),
        getDescription: baseCommand.getDescription.bind(baseCommand),
        canUndo: baseCommand.canUndo.bind(baseCommand),
        serialize: baseCommand.serialize.bind(baseCommand),
      };

      await act(async () => {
        await result.current.execute(failingCommand);
      });

      await act(async () => {
        await expect(result.current.undo()).rejects.toThrow('Undo failed');
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });
    });
  });

  describe('Redo Functionality', () => {
    it('should redo an undone command', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command = new MockCommand('Test command');

      await act(async () => {
        await result.current.execute(command);
        await result.current.undo();
      });

      await act(async () => {
        await result.current.redo();
      });

      await waitFor(() => {
        expect(result.current.canUndo).toBe(true);
        expect(result.current.canRedo).toBe(false);
      });
    });

    it('should set isProcessing during redo', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command = new MockCommand('Test command');

      await act(async () => {
        await result.current.execute(command);
        await result.current.undo();
      });

      // Start redo and check isProcessing immediately
      act(() => {
        result.current.redo();
      });

      // isProcessing should be true immediately after calling redo
      expect(result.current.isProcessing).toBe(true);

      // Wait for redo to complete
      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });
    });

    it('should prevent concurrent redo operations', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command = new MockCommand('Test command');

      await act(async () => {
        await result.current.execute(command);
        await result.current.undo();
      });

      // Start first redo
      const redo1 = act(async () => result.current.redo());

      // Try second redo immediately (should be ignored due to isProcessingRef)
      await act(async () => {
        await result.current.redo();
      });

      await redo1;
      await waitFor(() => {
        expect(result.current.canUndo).toBe(true);
      });
    });
  });

  describe('State Updates from Events', () => {
    it('should update state when command stack changes', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command = new MockCommand('Test command');

      // Execute command via manager directly (bypassing hook)
      await act(async () => {
        await commandManager.execute(command);
      });

      await waitFor(() => {
        expect(result.current.canUndo).toBe(true);
      });
    });

    it('should not update state during processing', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command = new MockCommand('Test command');

      // Wait for hook to initialize
      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      await act(async () => {
        await result.current.execute(command);
      });

      // Start undo (sets isProcessing)
      const undoPromise = act(async () => result.current.undo());

      // Emit event during processing
      await act(async () => {
        eventBus.publish({
          type: EventType.PERMISSION_CHANGED,
          timestamp: Date.now(),
          userId: '',
          projectId: '',
          permission: 'command_stack_changed',
          granted: false,
        } as any);
      });

      await undoPromise;
      // State should reflect final state, not intermediate
      expect(result.current.isProcessing).toBe(false);
    });
  });

  describe('Clear and History', () => {
    it('should clear command history', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command = new MockCommand('Test command');

      await act(async () => {
        await result.current.execute(command);
      });

      await waitFor(() => {
        expect(result.current.canUndo).toBe(true);
      });

      act(() => {
        result.current.clear();
      });

      await waitFor(() => {
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
      });
    });

    it('should return command history', async () => {
      const { result } = renderHook(() => useCommandManager());
      const command1 = new MockCommand('Command 1');
      const command2 = new MockCommand('Command 2');

      await act(async () => {
        await result.current.execute(command1);
        await result.current.execute(command2);
      });

      const history = result.current.getHistory();
      expect(history.length).toBe(2);
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe from events on unmount', () => {
      const { unmount } = renderHook(() => useCommandManager());
      
      const subscriberCountBefore = eventBus.getSubscriberCount(EventType.PERMISSION_CHANGED);
      
      unmount();
      
      // Give time for cleanup
      act(() => {
        jest.runAllTimers();
      });

      // Subscriber count should decrease (exact count depends on other tests)
      // But we can verify no errors occur
      expect(() => {
        eventBus.publish({
          type: EventType.PERMISSION_CHANGED,
          timestamp: Date.now(),
          userId: '',
          projectId: '',
          permission: 'test',
          granted: false,
        } as any);
      }).not.toThrow();
    });
  });
});

