import { Editor } from "@monaco-editor/react";

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
  return (
    <div className="flex-1">
      <Editor
        height="100%"
        width="100%"
        theme={isDark ? "vs-dark" : "light"}
        language={language}
        value={content}
        onChange={onChange}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          padding: { top: 10 },
          automaticLayout: true,
          wordWrap: "on",
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: true,
          renderWhitespace: "selection",
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true
          },
          suggest: {
            showKeywords: true,
            showSnippets: true
          },
          quickSuggestions: {
            other: true,
            comments: true,
            strings: true
          }
        }}
      />
    </div>
  );
}
