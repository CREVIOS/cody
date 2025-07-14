import { Editor } from "@monaco-editor/react";
import { useEffect, useRef } from "react";

interface MonacoEditorWrapperProps {
  language: string;
  content: string;
  onChange: (value: string | undefined) => void;
  isDark: boolean;
}

export function MonacoEditorWrapper({ 
  language, 
  content, 
  onChange, 
  isDark 
}: MonacoEditorWrapperProps) {
  const editorRef = useRef<any>(null);

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
  };

  return (
    <div className="flex-1 relative">
      <Editor
        height="100%"
        width="100%"
        theme={isDark ? "vs-dark" : "light"}
        language={language}
        value={content}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
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
          
          // Smooth scrolling
          smoothScrolling: true,
          
          // Mouse
          mouseWheelZoom: true,
          mouseWheelScrollSensitivity: 1,
          fastScrollSensitivity: 5,
          
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
  );
}
