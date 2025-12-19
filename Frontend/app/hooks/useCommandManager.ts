/**
 * React Hook for Command Manager
 *
 * Provides reactive state for undo/redo operations in React components.
 * Automatically subscribes to command stack changes and updates UI.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { commandManager } from "@/lib/commands/CommandManager";
import { Command } from "@/lib/commands/Command";
import { eventBus, EventType } from "@/lib/events/EventBus";

interface CommandManagerState {
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
  isProcessing: boolean;
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
    isProcessing: false,
  });

  // Use ref to track processing state synchronously (prevents race conditions)
  const isProcessingRef = useRef(false);

  // Update state when command stack changes
  useEffect(() => {
    const handleStackChange = () => {
      // Don't update state if we're processing (to avoid race conditions)
      if (isProcessingRef.current) {
        return;
      }
      
      const newState = {
        canUndo: commandManager.canUndo(),
        canRedo: commandManager.canRedo(),
        undoDescription: commandManager.getUndoDescription(),
        redoDescription: commandManager.getRedoDescription(),
        isProcessing: false,
      };
      
      setState(newState);
    };

    // Initial state check
    handleStackChange();

    // Subscribe to stack change events
    const unsubscribe = eventBus.subscribe(
      EventType.PERMISSION_CHANGED, // Reusing existing event type
      (event: any) => {
        if (event.permission === 'command_stack_changed') {
          // Update state immediately when event is received
          handleStackChange();
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Memoized action handlers
  const undo = useCallback(async () => {
    // Prevent multiple simultaneous operations using ref (synchronous check)
    if (isProcessingRef.current) {
      return; // Already processing, ignore this call
    }
    
    isProcessingRef.current = true;
    // Update state immediately to disable buttons (synchronous state update)
    setState(prev => ({
      ...prev,
      canUndo: false,
      canRedo: false,
      isProcessing: true,
    }));

    try {
      await commandManager.undo();
      // Immediately update state after undo (don't wait for event)
      setState({
        canUndo: commandManager.canUndo(),
        canRedo: commandManager.canRedo(),
        undoDescription: commandManager.getUndoDescription(),
        redoDescription: commandManager.getRedoDescription(),
        isProcessing: false,
      });
    } catch (error) {
      console.error('Undo failed:', error);
      // Update state on error to reflect actual state
      setState({
        canUndo: commandManager.canUndo(),
        canRedo: commandManager.canRedo(),
        undoDescription: commandManager.getUndoDescription(),
        redoDescription: commandManager.getRedoDescription(),
        isProcessing: false,
      });
      throw error;
    } finally {
      isProcessingRef.current = false;
    }
  }, []);

  const redo = useCallback(async () => {
    // Prevent multiple simultaneous operations using ref (synchronous check)
    if (isProcessingRef.current) {
      return; // Already processing, ignore this call
    }
    
    isProcessingRef.current = true;
    // Update state immediately to disable buttons (synchronous state update)
    setState(prev => ({
      ...prev,
      canUndo: false,
      canRedo: false,
      isProcessing: true,
    }));

    try {
      await commandManager.redo();
      // Immediately update state after redo (don't wait for event)
      setState({
        canUndo: commandManager.canUndo(),
        canRedo: commandManager.canRedo(),
        undoDescription: commandManager.getUndoDescription(),
        redoDescription: commandManager.getRedoDescription(),
        isProcessing: false,
      });
    } catch (error) {
      console.error('Redo failed:', error);
      // Update state on error to reflect actual state
      setState({
        canUndo: commandManager.canUndo(),
        canRedo: commandManager.canRedo(),
        undoDescription: commandManager.getUndoDescription(),
        redoDescription: commandManager.getRedoDescription(),
        isProcessing: false,
      });
      throw error;
    } finally {
      isProcessingRef.current = false;
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
