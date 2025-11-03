'use client';

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

      <Editor
        height="100%"
        theme={isDark ? 'vs-dark' : 'light'}
        language={language}
        value={content}
        onChange={(v) => {
          if (isEditor) onChange(v);
        }}
        onMount={handleMount}
        options={{
          readOnly: !isEditor,
          fontSize: 14,
          minimap: { enabled: true },
        }}
      />
    </div>
  );
} 