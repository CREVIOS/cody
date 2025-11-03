"use client";

import { useState } from "react";
import { Editor } from "@monaco-editor/react";

interface CodeEditorProps {
  theme: string;
  language: string;
}

export default function CodeEditor({ theme, language }: CodeEditorProps) {
  const [code, setCode] = useState("// Start coding...");

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          width="100%"
          theme={theme === "dark" ? "vs-dark" : "light"}
          language={language}
          value={code}
          onChange={(value) => setCode(value || "")}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            padding: { top: 10 },
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
