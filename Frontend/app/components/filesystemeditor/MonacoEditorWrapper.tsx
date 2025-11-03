'use client';
import { Editor } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { useCollaborativeEditor } from "../../hooks/use-collaborative-editor";
import { RemoteCursors, injectRemoteCursorStyles } from "../collaboration/RemoteCursors";
import { CollaborativeUserAvatars } from "../collaboration/CollaborativeUserList";

import { Editor, type OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import type * as monacoTypes from 'monaco-editor';
import { useRealtimeCursors } from '@/hooks/use-realtime-cursors';

type Props = {
  language: string;
  content: string;
  onChange: (value: string | undefined) => void;
  isDark: boolean;
  userId?: string;   // optional external id; otherwise a per-tab id is used
  username: string;
  roomName: string;  // websocket channel (can be shared across files)
  docKey?: string;   // per-file key; defaults to roomName
};

  // Collaboration options (optional)
  collaboration?: {
    enabled: boolean;
    docId: string;
    user: {
      id: string;
      name: string;
      color?: string;
    };
    wsUrl?: string;
    offlineSupport?: boolean;
  };
}

export function MonacoEditorWrapper({
  language,
  content,
  onChange,
  isDark,
  userId,
  username,
  roomName,
  docKey,
}: Props) {
  const editorRef = useRef<monacoTypes.editor.IStandaloneCodeEditor | null>(null);

  const { isEditor, activeEditor, inactivitySeconds, lockEvent } = useRealtimeCursors({
    roomName,
    username,
    userId,
    throttleMs: 50,
    docKey: docKey ?? roomName, // IMPORTANT: scope lock/queue to this file
  });

  // Apply read-only when I am not the editor
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.updateOptions({
      readOnly: !isEditor,
      readOnlyMessage: !isEditor ? { value: '🔒 Another user is editing this file' } : undefined,
  collaboration
}: MonacoEditorWrapperProps) {
  const editorRef = useRef<any>(null);

  // Setup collaboration if enabled
  const [collabState, collabActions] = useCollaborativeEditor(
    collaboration?.enabled
      ? {
          editor: editorRef.current,
          docId: collaboration.docId,
          user: collaboration.user,
          wsUrl: collaboration.wsUrl,
          offlineSupport: collaboration.offlineSupport,
          logging: true,
        }
      : {
          editor: null,
          docId: '',
          user: { id: '', name: '' },
        }
  );

  // Inject remote cursor styles on mount
  useEffect(() => {
    if (collaboration?.enabled) {
      injectRemoteCursorStyles();
    }
  }, [collaboration?.enabled]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    
    // Add custom keybindings for enhanced functionality
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      editor.trigger('keyboard', 'actions.find');
    });
    
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => {
      editor.trigger('keyboard', 'editor.action.startFindReplaceAction');
    });
    
    // Multi-cursor shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
      editor.trigger('keyboard', 'editor.action.addSelectionToNextFindMatch');
    });
    
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL, () => {
      editor.trigger('keyboard', 'editor.action.selectHighlights');
    });
    
    // Code folding shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketLeft, () => {
      editor.trigger('keyboard', 'editor.fold');
    });
    
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketRight, () => {
      editor.trigger('keyboard', 'editor.unfold');
    });
    
    // Fold all / Unfold all
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      editor.addCommand(monaco.KeyCode.Digit0, () => {
        editor.trigger('keyboard', 'editor.foldAll');
      });
    });
    
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      editor.addCommand(monaco.KeyCode.KeyJ, () => {
        editor.trigger('keyboard', 'editor.unfoldAll');
      });
    });
    const node = ed.getDomNode();
    if (node) node.style.outline = !isEditor ? '1px dashed #ef4444' : 'none';
  }, [isEditor]);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 text-xs border-b bg-black-50 dark:bg-zinc-900/60 flex items-center gap-4">
        <span>Room: {roomName}</span>
        <span>{isEditor ? '✅ You can edit' : '🔒 Read-only'}</span>
        {!isEditor && activeEditor ? <span className="opacity-70">editor: {activeEditor}</span> : null}
        <span className="opacity-70">
          Inactivity: {Math.floor(inactivitySeconds / 60)}m {inactivitySeconds % 60}s
        </span>
        <span className="opacity-70">{lockEvent}</span>
      </div>
    <div className="flex-1 relative">
      {/* Collaboration UI */}
      {collaboration?.enabled && (
        <>
          {/* User avatars in top-right corner */}
          <div className="absolute top-2 right-4 z-10">
            <CollaborativeUserAvatars
              awareness={collabState.users.size > 0 ? { getStates: () => collabState.users } as any : null}
              connectionStatus={collabState.status}
              currentUserId={collaboration.user.id}
            />
          </div>

          {/* Remote cursors */}
          {editorRef.current && (
            <RemoteCursors
              editor={editorRef.current}
              awareness={collabActions.getAwarenessStates ? { getStates: collabActions.getAwarenessStates, on: () => {}, off: () => {} } as any : null}
            />
          )}
        </>
      )}

      <Editor
        height="100%"
        theme={isDark ? 'vs-dark' : 'light'}
        language={language}
        value={content}
        onChange={(v) => {
          if (isEditor) onChange(v);
        }}
        onMount={handleMount}
        value={collaboration?.enabled ? undefined : content}
        onChange={collaboration?.enabled ? undefined : onChange}
        onMount={handleEditorDidMount}
        options={{
          readOnly: !isEditor,
          fontSize: 14,
          minimap: { enabled: true },
        }}
      />
    </div>
  );
} 