'use client';

import { useEffect, useState, useRef } from 'react';
import type * as Monaco from 'monaco-editor';
import type { Awareness } from 'y-protocols/awareness';

/**
 * Remote Cursors Component
 *
 * Renders remote user cursors and selections in Monaco Editor.
 * Features:
 * - Colored cursor markers with user names
 * - Selection highlights
 * - Smooth animations
 * - Automatic cleanup for stale cursors
 */

interface RemoteCursor {
  userId: string;
  userName: string;
  userColor: string;
  cursor: {
    line: number;
    column: number;
    offset: number;
  } | null;
  selection: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  } | null;
  lastUpdate: number;
}

interface RemoteCursorsProps {
  editor: Monaco.editor.IStandaloneCodeEditor | null;
  awareness: Awareness | null;
  staleTimeout?: number; // ms before a cursor is considered stale
}

export function RemoteCursors({
  editor,
  awareness,
  staleTimeout = 5000,
}: RemoteCursorsProps) {
  const [cursors, setCursors] = useState<Map<number, RemoteCursor>>(new Map());
  const decorationsRef = useRef<Map<number, string[]>>(new Map());
  const widgetsRef = useRef<Map<number, Monaco.editor.IContentWidget>>(new Map());

  /**
   * Update cursors from awareness
   */
  useEffect(() => {
    if (!editor || !awareness) return;

    const updateCursors = () => {
      const states = awareness.getStates();
      const newCursors = new Map<number, RemoteCursor>();
      const localClientId = awareness.doc?.clientID;

      states.forEach((state, clientId) => {
        // Skip local user
        if (clientId === localClientId) return;

        // Skip if no user info
        if (!state.user) return;

        newCursors.set(clientId, {
          userId: state.user.id,
          userName: state.user.name,
          userColor: state.user.color,
          cursor: state.cursor || null,
          selection: state.selection || null,
          lastUpdate: Date.now(),
        });
      });

      setCursors(newCursors);
    };

    awareness.on('change', updateCursors);
    updateCursors(); // Initial update

    return () => {
      awareness.off('change', updateCursors);
    };
  }, [editor, awareness]);

  /**
   * Render cursor decorations and widgets
   */
  useEffect(() => {
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    // Clean up stale cursors
    const now = Date.now();
    const activeCursors = new Map<number, RemoteCursor>();

    cursors.forEach((cursor, clientId) => {
      if (now - cursor.lastUpdate < staleTimeout) {
        activeCursors.set(clientId, cursor);
      }
    });

    // Clear old decorations and widgets
    decorationsRef.current.forEach((decorationIds, clientId) => {
      if (!activeCursors.has(clientId)) {
        editor.removeDecorations(decorationIds);
      }
    });

    widgetsRef.current.forEach((widget, clientId) => {
      if (!activeCursors.has(clientId)) {
        editor.removeContentWidget(widget);
      }
    });

    // Create new decorations and widgets
    const newDecorations = new Map<number, string[]>();
    const newWidgets = new Map<number, Monaco.editor.IContentWidget>();

    activeCursors.forEach((cursor, clientId) => {
      const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

      // Selection decoration
      if (cursor.selection) {
        decorations.push({
          range: {
            startLineNumber: cursor.selection.start.line,
            startColumn: cursor.selection.start.column,
            endLineNumber: cursor.selection.end.line,
            endColumn: cursor.selection.end.column,
          },
          options: {
            className: 'remote-selection',
            stickiness: 1,
            inlineClassName: 'remote-selection-inline',
            style: `background-color: ${cursor.userColor}33;`, // 20% opacity
          },
        });
      }

      // Cursor decoration
      if (cursor.cursor) {
        decorations.push({
          range: {
            startLineNumber: cursor.cursor.line,
            startColumn: cursor.cursor.column,
            endLineNumber: cursor.cursor.line,
            endColumn: cursor.cursor.column,
          },
          options: {
            className: 'remote-cursor',
            stickiness: 1,
            beforeContentClassName: 'remote-cursor-before',
            style: `border-left: 2px solid ${cursor.userColor};`,
          },
        });

        // Cursor name widget
        const widget: Monaco.editor.IContentWidget = {
          getId: () => `remote-cursor-${clientId}`,
          getDomNode: () => {
            const node = document.createElement('div');
            node.className = 'remote-cursor-label';
            node.style.cssText = `
              background-color: ${cursor.userColor};
              color: white;
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 11px;
              font-weight: 500;
              white-space: nowrap;
              pointer-events: none;
              z-index: 1000;
              position: absolute;
              transform: translateY(-100%);
              margin-top: -2px;
            `;
            node.textContent = cursor.userName;
            return node;
          },
          getPosition: () => ({
            position: {
              lineNumber: cursor.cursor!.line,
              column: cursor.cursor!.column,
            },
            preference: [
              Monaco.editor.ContentWidgetPositionPreference.ABOVE,
              Monaco.editor.ContentWidgetPositionPreference.BELOW,
            ],
          }),
        };

        newWidgets.set(clientId, widget);
      }

      // Apply decorations
      if (decorations.length > 0) {
        const decorationIds = editor.deltaDecorations(
          decorationsRef.current.get(clientId) || [],
          decorations
        );
        newDecorations.set(clientId, decorationIds);
      }
    });

    // Add widgets
    newWidgets.forEach((widget) => {
      editor.addContentWidget(widget);
    });

    decorationsRef.current = newDecorations;
    widgetsRef.current = newWidgets;

    return () => {
      // Cleanup all decorations and widgets
      decorationsRef.current.forEach((decorationIds) => {
        editor.removeDecorations(decorationIds);
      });

      widgetsRef.current.forEach((widget) => {
        editor.removeContentWidget(widget);
      });

      decorationsRef.current.clear();
      widgetsRef.current.clear();
    };
  }, [editor, cursors, staleTimeout]);

  // This component doesn't render anything visible itself
  return null;
}

/**
 * Inject CSS styles for remote cursors
 */
export function injectRemoteCursorStyles() {
  if (typeof document === 'undefined') return;

  const styleId = 'remote-cursor-styles';

  // Don't inject twice
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .remote-cursor {
      position: relative;
    }

    .remote-cursor-before {
      border-left: 2px solid;
      position: absolute;
      height: 100%;
      animation: remote-cursor-blink 1s ease-in-out infinite;
    }

    @keyframes remote-cursor-blink {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0.3; }
    }

    .remote-selection {
      position: relative;
    }

    .remote-selection-inline {
      position: relative;
    }

    .remote-cursor-label {
      animation: remote-cursor-label-fade-in 0.2s ease-out;
    }

    @keyframes remote-cursor-label-fade-in {
      from {
        opacity: 0;
        transform: translateY(-100%) scale(0.9);
      }
      to {
        opacity: 1;
        transform: translateY(-100%) scale(1);
      }
    }
  `;

  document.head.appendChild(style);
}
