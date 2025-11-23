/**
 * React Hook for Command Manager
 *
 * Provides reactive state for undo/redo operations in React components.
 * Automatically subscribes to command stack changes and updates UI.
 */

import { useState, useEffect, useCallback } from "react";
import { commandManager } from "@/lib/commands/CommandManager";
import { Command } from "@/lib/commands/Command";
import { eventBus, EventType } from "@/lib/events/EventBus";

interface CommandManagerState {
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
}

/**
 * Hook for accessing command manager state and actions
 *
 * @example
 * ```typescript
 * function FileEditor() {
 *   const { canUndo, canRedo, undo, redo, execute } = useCommandManager();
 *
 *   const handleDelete = async () => {
 *     const command = new DeleteFileCommand(userId, projectId, filePath, fileSystem);
 *     await execute(command);
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={undo} disabled={!canUndo}>Undo</button>
 *       <button onClick={redo} disabled={!canRedo}>Redo</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useCommandManager() {
  const [state, setState] = useState<CommandManagerState>({
    canUndo: commandManager.canUndo(),
    canRedo: commandManager.canRedo(),
    undoDescription: commandManager.getUndoDescription(),
    redoDescription: commandManager.getRedoDescription(),
  });

  // Update state when command stack changes
  useEffect(() => {
    const handleStackChange = () => {
      const newState = {
        canUndo: commandManager.canUndo(),
        canRedo: commandManager.canRedo(),
        undoDescription: commandManager.getUndoDescription(),
        redoDescription: commandManager.getRedoDescription(),
      };
      
      // Debug logging
      console.log('[useCommandManager] State update:', newState);
      
      setState(newState);
    };

    // Initial state check
    handleStackChange();

    // Subscribe to stack change events
    const unsubscribe = eventBus.subscribe(
      EventType.PERMISSION_CHANGED, // Reusing existing event type
      (event: any) => {
        console.log('[useCommandManager] Event received:', event);
        if (event.permission === 'command_stack_changed') {
          console.log('[useCommandManager] Command stack changed event detected');
          handleStackChange();
        }
      }
    );

    // Also poll the state periodically as a fallback (in case events are missed)
    // This ensures the UI stays in sync even if events fail
    const pollInterval = setInterval(() => {
      handleStackChange();
    }, 500); // Check every 500ms

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, []);

  // Memoized action handlers
  const undo = useCallback(async () => {
    try {
      await commandManager.undo();
    } catch (error) {
      console.error('Undo failed:', error);
      throw error;
    }
  }, []);

  const redo = useCallback(async () => {
    try {
      await commandManager.redo();
    } catch (error) {
      console.error('Redo failed:', error);
      throw error;
    }
  }, []);

  const execute = useCallback(async (command: Command) => {
    try {
      await commandManager.execute(command);
    } catch (error) {
      console.error('Command execution failed:', error);
      throw error;
    }
  }, []);

  const clear = useCallback(() => {
    commandManager.clear();
  }, []);

  const getHistory = useCallback(() => {
    return commandManager.getHistory();
  }, []);

  return {
    ...state,
    undo,
    redo,
    execute,
    clear,
    getHistory,
  };
}
