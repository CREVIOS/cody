/**
 * Undo/Redo Buttons Component
 *
 * Provides UI controls for undoing and redoing file operations.
 * Connected to the CommandManager via useCommandManager hook.
 */

"use client";

import React from 'react';
import { useCommandManager } from '@/hooks/useCommandManager';

export function UndoRedoButtons() {
  const { canUndo, canRedo, undoDescription, redoDescription, undo, redo } = useCommandManager();

  const handleUndo = async () => {
    try {
      await undo();
    } catch (error) {
      console.error('Undo failed:', error);
      // You could show a toast notification here
    }
  };

  const handleRedo = async () => {
    try {
      await redo();
    } catch (error) {
      console.error('Redo failed:', error);
      // You could show a toast notification here
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Undo Button */}
      <button
        onClick={handleUndo}
        disabled={!canUndo}
        title={undoDescription || "Nothing to undo"}
        className={`p-2 rounded-md transition-colors ${
          canUndo
            ? 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
        }`}
        aria-label="Undo"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
      </button>

      {/* Redo Button */}
      <button
        onClick={handleRedo}
        disabled={!canRedo}
        title={redoDescription || "Nothing to redo"}
        className={`p-2 rounded-md transition-colors ${
          canRedo
            ? 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
        }`}
        aria-label="Redo"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
        </svg>
      </button>

      {/* Visual separator */}
      <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Undo description (shows what would be undone) */}
      {canUndo && undoDescription && (
        <span className="text-xs text-gray-500 dark:text-gray-400 hidden md:block max-w-xs truncate">
          {undoDescription}
        </span>
      )}
    </div>
  );
}

export default UndoRedoButtons;
