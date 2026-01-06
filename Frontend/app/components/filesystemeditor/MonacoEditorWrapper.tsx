'use client';

import { useCollaborativeEditor } from "../../hooks/use-collaborative-editor";
import { RemoteCursors, injectRemoteCursorStyles } from "../collaboration/RemoteCursors";
import { CollaborativeUserAvatars } from "../collaboration/CollaborativeUserList";
import { Editor } from '@monaco-editor/react';
import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
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
    projectId?: string;
    filePath?: string;
    user: {
      id: string;
      name: string;
      color?: string;
    };
    wsUrl?: string;
    offlineSupport?: boolean;
  };
  
  // Callback to receive collaboration actions (for save pipeline)
  onCollaborationReady?: (actions: { 
    getSnapshot?: () => string;
    setContent?: (content: string) => void;
  }) => void;
  
  // Phase 5: Lock state for permission enforcement
  lockState?: {
    state: "UNLOCKED" | "LOCKED";
    locked_by?: string | null;
    canEdit?: boolean;
    expires_in?: number | null;
  } | null;
  lockStatusMessage?: string;
  
  // Phase 7: WebSocket status callback for debug panel
  onWsStatusChange?: (status: 'connected' | 'disconnected' | 'syncing' | 'error') => void;
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
  onCollaborationReady,
  lockState,
  lockStatusMessage,
  onWsStatusChange,
}: MonacoEditorWrapperProps) {
  const editorRef = useRef<any | null>(null);
  const [editorForKey, setEditorForKey] = useState<{ key: string; editor: any | null }>({
    key: '',
    editor: null,
  });
  const viewStatesRef = useRef<Map<string, any>>(new Map());
  const editorKey = docKey ?? roomName;
  const effectiveEditor = editorForKey.key === editorKey ? editorForKey.editor : null;

  // Realtime cursors / locking (top-level hook usage)
  const { inactivitySeconds, lockEvent } = useRealtimeCursors({
    roomName,
    username,
    userId,
    throttleMs: 50,
    docKey: docKey ?? roomName,
  });

  // COMMENTED OUT: Lock-based read-only check disabled (CRDT-only mode)
  // // Phase 5: Determine effective read-only state from locks and permissions
  // const effectiveReadOnly = useMemo(() => {
  //   if (forceReadOnly) return true;
  //   
  //   // Check lock state if available
  //   if (lockState) {
  //     if (lockState.state === 'LOCKED') {
  //       // Locked by someone else - read-only
  //       if (lockState.locked_by && lockState.locked_by !== userId) {
  //         return true;
  //       }
  //       // Use canEdit from lock state if available
  //       if ('canEdit' in lockState && !lockState.canEdit) {
  //         return true;
  //       }
  //     }
  //   }
  //   
  //   // Fallback to realtime cursor system
  //   return !isEditor;
  // }, [forceReadOnly, lockState, userId, isEditor]);
  
  // CRDT-only mode: NEVER block writes - always allow editing
  // Write permissions should never be blocked in CRDT mode
  const effectiveReadOnly = useMemo(() => {
    // Always return false - never make editor read-only in CRDT mode
    // CRDT handles conflict resolution automatically, so all users can edit
    return false;
  }, []);

  // COMMENTED OUT: Lock status message disabled (CRDT-only mode)
  // // Phase 5: Get lock status message
  // const readOnlyMessage = useMemo(() => {
  //   if (forceReadOnly) {
  //     return { value: '🔒 You do not have edit permission for this project' };
  //   }
  //   
  //   if (lockState?.state === 'LOCKED' && lockState.locked_by && lockState.locked_by !== userId) {
  //     return { value: lockStatusMessage || `🔒 File locked by ${lockState.locked_by.substring(0, 8)}...` };
  //   }
  //   
  //   if (!isEditor) {
  //     return { value: '🔒 Another user is editing this file' };
  //   }
  //   
  //   return undefined;
  // }, [forceReadOnly, lockState, userId, isEditor, lockStatusMessage]);
  
  // CRDT-only mode: no read-only messages - everyone can edit
  const readOnlyMessage = useMemo(() => {
    // Never show read-only messages in CRDT mode
    // All users can edit simultaneously
    return undefined;
  }, []);

  // Apply read-only mode based on lock state and permissions
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.updateOptions({
      readOnly: effectiveReadOnly,
      readOnlyMessage: readOnlyMessage,
    });
    const node = ed.getDomNode();
    if (node) node.style.outline = effectiveReadOnly ? '1px dashed #ef4444' : 'none';
  }, [effectiveReadOnly, readOnlyMessage]);

  // COMMENTED OUT: Lock-based CRDT enable check disabled (CRDT-only mode)
  // // Phase 5: Only enable CRDT editing if user has lock
  // const canEditWithLock = useMemo(() => {
  //   if (!lockState) return false; // No lock state yet
  //   if (lockState.state === 'LOCKED') {
  //     // Check if user holds the lock
  //     if (lockState.locked_by && lockState.locked_by !== userId) {
  //       return false; // Locked by someone else
  //     }
  //     // Use canEdit from lock state if available
  //     if ('canEdit' in lockState) {
  //       return lockState.canEdit;
  //     }
  //     return true; // User holds the lock
  //   }
  //   return lockState.state === 'UNLOCKED';
  // }, [lockState, userId]);
  
  // CRDT-only mode: always enable CRDT if collaboration is enabled (no lock checks)
  const canEditWithLock = true;
  const collabLogging = process.env.NEXT_PUBLIC_COLLAB_LOGGING === '1';

  // Setup collaboration if enabled
  // COMMENTED OUT: Lock check removed - CRDT always enabled when collaboration is enabled
  // Phase 5: CRDT binding only active when user has edit lock
  const [collabState, collabActions] = useCollaborativeEditor(
    collaboration?.enabled && canEditWithLock
      ? {
          editor: effectiveEditor,
          docId: collaboration.docId,
          projectId: collaboration.projectId,
          filePath: collaboration.filePath,
          user: collaboration.user,
          wsUrl: collaboration.wsUrl,
          offlineSupport: collaboration.offlineSupport,
          logging: collabLogging,
          initialContent: content, // Pass initial content from backend/MinIO
        }
      : {
          editor: null,
          docId: '',
          user: { id: '', name: '' },
        }
  );

  // Pass collaboration actions to parent for save pipeline
  useEffect(() => {
    if (collaboration?.enabled && collabActions && onCollaborationReady) {
      onCollaborationReady({
        getSnapshot: collabActions.getSnapshot,
        setContent: collabActions.setContent,
      });
    }
  }, [collaboration?.enabled, collabActions, onCollaborationReady]);

  // Preserve per-file cursor/scroll position when switching between files.
  // We store view state by `editorKey` and restore it on mount/model swap.
  useEffect(() => {
    return () => {
      const ed = editorRef.current;
      if (!ed || !editorKey) return;
      try {
        viewStatesRef.current.set(editorKey, ed.saveViewState());
      } catch {
        // ignore
      }
    };
  }, [editorKey]);

  // Phase 7: Report WebSocket status to parent for debug panel
  useEffect(() => {
    if (!collaboration?.enabled || !onWsStatusChange) {
      // If collaboration is disabled, report disconnected
      if (onWsStatusChange) {
        onWsStatusChange('disconnected');
      }
      return;
    }
    
    // Map collabState.status to WebSocket status
    // ConnectionStatus is: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
    // Map to: 'connected' | 'disconnected' | 'syncing' | 'error'
    const status = collabState.status || 'disconnected';
    let mappedStatus: 'connected' | 'disconnected' | 'syncing' | 'error';
    
    if (status === 'connected') {
      mappedStatus = 'connected';
    } else if (status === 'connecting' || status === 'reconnecting') {
      mappedStatus = 'syncing';
    } else if (collabState.error) {
      mappedStatus = 'error';
    } else {
      mappedStatus = 'disconnected';
    }
    
    onWsStatusChange(mappedStatus);
    
    // Phase 7: Show offline warning if disconnected
    if (mappedStatus === 'disconnected' && process.env.NODE_ENV === 'development') {
      console.warn('[Phase 7] Collaboration offline — changes are local only');
    }
  }, [collabState.status, collabState.error, collaboration?.enabled, onWsStatusChange]);

  // Inject remote cursor styles on mount
  useEffect(() => {
    if (collaboration?.enabled) {
      injectRemoteCursorStyles();
    }
  }, [collaboration?.enabled]);

  const handleEditorDidMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    setEditorForKey({ key: editorKey, editor });
    
    // Restore view state for this file, if available
    const saved = editorKey ? viewStatesRef.current.get(editorKey) : null;
    if (saved) {
      try {
        editor.restoreViewState(saved);
      } catch {
        // ignore
      }
    }
    editor.focus();
    
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
  }, [editorKey]);

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
        {/* COMMENTED OUT: Leader election read-only check disabled (CRDT-only mode) */}
        {/* <span>{(forceReadOnly || !isEditor) ? '🔒 Read-only' : '✅ You can edit'}</span> */}
        <span>{forceReadOnly ? '🔒 Read-only (no permission)' : '✅ You can edit (CRDT mode)'}</span>
        {/* {!isEditor && activeEditor ? <span className="opacity-70">editor: {activeEditor}</span> : null} */}
        <span className="opacity-70">
          Inactivity: {Math.floor(inactivitySeconds / 60)}m {inactivitySeconds % 60}s
        </span>
        <span className="opacity-70">{lockEvent}</span>
      </div>
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden" style={{ transition: 'opacity 0.2s ease' }}>
        <Editor
          key={editorKey}
          path={editorKey}
          height="100%"
          width="100%"
          theme={isDark ? "vs-dark" : "light"}
          language={language}
          value={collaboration?.enabled ? undefined : content}
          onChange={onChange}
          onMount={handleEditorDidMount}
          loading={<div className="flex items-center justify-center h-full text-[#cccccc]">Loading editor...</div>}
        options={{
          readOnly: effectiveReadOnly,
          readOnlyMessage: readOnlyMessage,
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
          
          // Quick suggestions - disabled to prevent auto-completion on single characters
          quickSuggestions: {
            other: false,  // Disable auto-suggestions while typing
            comments: false,
            strings: false
          },
          quickSuggestionsDelay: 500,  // Increased delay if re-enabled
          
          // Disable word-based suggestions that cause "l" -> "length" auto-completion
          // Use 'off' to satisfy the editor options type
          wordBasedSuggestions: 'off',
          
          // Only show suggestions when explicitly triggered (Ctrl+Space)
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnCommitCharacter: false,
          acceptSuggestionOnEnter: 'on',  // Only accept on Enter, not Tab
          tabCompletion: 'off',  // Disable tab completion
          
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
          
          // Render optimization for smoothness
          renderValidationDecorations: 'on',
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
