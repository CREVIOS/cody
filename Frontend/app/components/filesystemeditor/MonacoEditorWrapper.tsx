'use client';

import { useCollaborativeEditor } from "../../hooks/use-collaborative-editor";
import { RemoteCursors, injectRemoteCursorStyles } from "../collaboration/RemoteCursors";
import { CollaborativeUserAvatars } from "../collaboration/CollaborativeUserList";
import { Editor } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
// Using any to avoid depending on monaco-editor type package
import { useRealtimeCursors } from '@/hooks/use-realtime-cursors';


// Define the type for the editor instance
type MonacoEditor = any;

interface MonacoEditorWrapperProps {
  language: string;
  content: string;
  onChange: (value: string | undefined) => void;
  isDark: boolean;
  userId?: string;   // optional external id; otherwise a per-tab id is used
  username: string;
  roomName: string;  // websocket channel (can be shared across files)
  docKey?: string; 
  forceReadOnly?: boolean;

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
  collaboration, 
  userId,
  username,
  roomName,
  docKey,
  forceReadOnly = false,
}: MonacoEditorWrapperProps) {
  const editorRef = useRef<any | null>(null);

  // Realtime cursors / locking (top-level hook usage)
  const { isEditor, activeEditor, inactivitySeconds, lockEvent } = useRealtimeCursors({
    roomName,
    username,
    userId,
    throttleMs: 50,
    docKey: docKey ?? roomName,
  });

  // Apply read-only mode based on permission and current leader/editor
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.updateOptions({
      readOnly: forceReadOnly || !isEditor,
      readOnlyMessage: forceReadOnly
        ? { value: '🔒 You do not have edit permission for this project' }
        : (!isEditor ? { value: '🔒 Another user is editing this file' } : undefined),
    });
    const node = ed.getDomNode();
    if (node) node.style.outline = (forceReadOnly || !isEditor) ? '1px dashed #ef4444' : 'none';
  }, [isEditor, forceReadOnly]);

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

    // Hook usage moved to top-level; mount handler only sets ref and keybindings
  };

  return (
    <div className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
      {/* Collaboration UI */}
      {collaboration?.enabled && (
        <>
          {/* User avatars in top-right corner */}
          <div className="absolute top-2 right-4 z-10">
            <CollaborativeUserAvatars
              awareness={collabActions.getAwareness?.() || null}
              connectionStatus={collabState.status}
              currentUserId={collaboration.user.id}
            />
          </div>

          {/* Remote cursors */}
          {editorRef.current && (
            <RemoteCursors
              editor={editorRef.current}
              awareness={collabActions.getAwareness?.() || null}
            />
          )}
        </>
      )}
      

      <div className={`px-3 py-1.5 text-xs border-b flex items-center gap-4 shrink-0 ${
        isDark 
          ? 'bg-[#1e1e1e] border-[#3e3e42] text-[#cccccc]' 
          : 'bg-[#ffffff] border-[#e5e5e5] text-[#383838]'
      }`}>
        <span>Room: {roomName}</span>
        <span>{(forceReadOnly || !isEditor) ? '🔒 Read-only' : '✅ You can edit'}</span>
        {!isEditor && activeEditor ? <span className="opacity-70">editor: {activeEditor}</span> : null}
        <span className="opacity-70">
          Inactivity: {Math.floor(inactivitySeconds / 60)}m {inactivitySeconds % 60}s
        </span>
        <span className="opacity-70">{lockEvent}</span>
      </div>
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden" style={{ transition: 'opacity 0.2s ease' }}>
        <Editor
          height="100%"
          width="100%"
          theme={isDark ? "vs-dark" : "light"}
          language={language}
          value={collaboration?.enabled ? undefined : content}
          onChange={collaboration?.enabled ? undefined : onChange}
          onMount={handleEditorDidMount}
          loading={<div className="flex items-center justify-center h-full text-[#cccccc]">Loading editor...</div>}
        options={{
          readOnly: forceReadOnly || !isEditor,
          readOnlyMessage: forceReadOnly
            ? { value: '🔒 You do not have edit permission for this project' }
            : (!isEditor ? { value: '🔒 Another user is editing this file' } : undefined),
          fontSize: 14,
          lineHeight: 21,
          
          // Enable minimap (right overview)
          minimap: { 
            enabled: true,
            side: 'right',
            showSlider: 'always',
            renderCharacters: true,
            maxColumn: 120,
            scale: 1
          },
          
          // Enhanced scrollbar
          scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            useShadows: true,
            verticalHasArrows: false,
            horizontalHasArrows: false,
            verticalScrollbarSize: 12,
            horizontalScrollbarSize: 12
          },
          
          // Overview ruler (shows errors, warnings, etc.)
          overviewRulerLanes: 3,
          overviewRulerBorder: false,
          
          // Code folding
          folding: true,
          foldingStrategy: 'indentation',
          foldingHighlight: true,
          foldingImportsByDefault: false,
          unfoldOnClickAfterEndOfLine: true,
          showFoldingControls: 'always',
          
          // Multi-cursor editing
          multiCursorModifier: 'ctrlCmd',
          multiCursorMergeOverlapping: true,
          multiCursorPaste: 'spread',
          
          // Enhanced find/replace
          find: {
            seedSearchStringFromSelection: 'always',
            autoFindInSelection: 'never',
            addExtraSpaceOnTop: true,
            loop: true
          },
          
          // Advanced editing features
          wordWrap: "on",
          wordWrapColumn: 120,
          wrappingIndent: 'indent',
          wordWrapBreakAfterCharacters: '\t})]?|/&,;',
          wordWrapBreakBeforeCharacters: '{([+',
          
          // Indentation and formatting
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: true,
          trimAutoWhitespace: true,
          
          // Visual enhancements
          renderWhitespace: "selection",
          renderControlCharacters: true,
          renderLineHighlight: 'all',
          renderLineHighlightOnlyWhenFocus: false,
          
          // Bracket pair colorization
          bracketPairColorization: { 
            enabled: true,
            independentColorPoolPerBracketType: true
          },
          
          // Guides
          guides: {
            bracketPairs: true,
            bracketPairsHorizontal: true,
            highlightActiveBracketPair: true,
            indentation: true,
            highlightActiveIndentation: true
          },
          
          // Enhanced bracket matching
          showUnused: true,
          
          // Code lens
          codeLens: true,
          
          // Suggestions and IntelliSense
          suggest: {
            showKeywords: true,
            showSnippets: true,
            showClasses: true,
            showFunctions: true,
            showVariables: true,
            showModules: true,
            showProperties: true,
            showEvents: true,
            showOperators: true,
            showUnits: true,
            showValues: true,
            showConstants: true,
            showEnums: true,
            showEnumMembers: true,
            showColors: true,
            showFiles: true,
            showReferences: true,
            showFolders: true,
            showTypeParameters: true,
            showStructs: true,
            showFields: true,
            showInterfaces: true,
            showIssues: true,
            showUsers: true,
            insertMode: 'insert',
            filterGraceful: true,
            snippetsPreventQuickSuggestions: false,
            localityBonus: true,
            shareSuggestSelections: true,
            showInlineDetails: true,
            showStatusBar: true
          },
          
          // Quick suggestions
          quickSuggestions: {
            other: true,
            comments: true,
            strings: true
          },
          quickSuggestionsDelay: 100,
          
          // Parameter hints
          parameterHints: {
            enabled: true,
            cycle: true
          },
          
          // Hover
          hover: {
            enabled: true,
            delay: 300,
            sticky: true
          },
          
          // Auto-closing
          autoClosingBrackets: 'languageDefined',
          autoClosingComments: 'languageDefined',
          autoClosingQuotes: 'languageDefined',
          autoClosingOvertype: 'auto',
          autoSurround: 'languageDefined',
          
          // Auto-indentation
          autoIndent: 'full',
          
          // Formatting
          formatOnType: true,
          formatOnPaste: true,
          
          // Layout and behavior
          automaticLayout: true,
          padding: { top: 10, bottom: 10 },
          glyphMargin: true,
          lineNumbers: 'on',
          lineNumbersMinChars: 3,
          lineDecorationsWidth: 20,
          
          // Selection
          selectOnLineNumbers: true,
          selectionHighlight: true,
          selectionClipboard: true,
          
          // Cursor
          cursorBlinking: 'blink',
          cursorSmoothCaretAnimation: 'on',
          cursorStyle: 'line',
          cursorSurroundingLines: 3,
          cursorSurroundingLinesStyle: 'default',
          cursorWidth: 2,
          
          // Smooth scrolling - Enhanced for better UX
          smoothScrolling: true,
          scrollBeyondLastLine: false,
          scrollBeyondLastColumn: 3,
          
          // Mouse - Enhanced responsiveness
          mouseWheelZoom: true,
          mouseWheelScrollSensitivity: 1,
          fastScrollSensitivity: 5,
          enableMultiCursorModifier: 'ctrlCmd',
          
          // Render optimization for smoothness
          renderValidationDecorations: 'on',
          renderWhitespace: 'selection',
          
          // Performance optimizations
          renderLineHighlight: 'all',
          renderIndentGuides: true,
          renderFinalNewline: 'on',
          renderControlCharacters: false,
          
          // Enhanced smoothness
          cursorSmoothCaretAnimation: 'on',
          cursorBlinking: 'smooth',
          
          // Accessibility
          accessibilitySupport: 'auto',
          
          // Performance
          disableLayerHinting: false,
          disableMonospaceOptimizations: false,
          
          // Links
          links: true,
          
          // Color decorators
          colorDecorators: true,
          
          // Drag and drop
          dragAndDrop: true,
          
          // Matching brackets
          matchBrackets: 'always',
          
          // Rulers (vertical lines)
          rulers: [80, 120],
          
          // Sticky scroll
          stickyScroll: {
            enabled: true,
            maxLineCount: 5,
            defaultModel: 'outlineModel'
          }

          
        }}
        />
      </div>
    </div>
  );
}
