"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Editor } from "@monaco-editor/react";
import { useFileSystem } from "@/context/FileSystemContext";
import { useTheme } from "@/context/ThemeContext";

interface FileSystemEditorProps {
  className?: string;
}

export default function FileSystemEditor({ className = "" }: FileSystemEditorProps) {
  const { theme } = useTheme();
  const { 
    selectedFile, 
    currentFileContent, 
    updateCurrentContent, 
    openFiles,
    selectFile,
    closeFile,
    saveFile
  } = useFileSystem();

  const [language, setLanguage] = useState("javascript");

  const isDark = theme === "dark";

  // Determine language based on file extension
  useEffect(() => {
    if (selectedFile) {
      const extension = selectedFile.name.split('.').pop()?.toLowerCase();
      const languageMap: { [key: string]: string } = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'json': 'json',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'md': 'markdown',
        'py': 'python',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'go': 'go',
        'rs': 'rust',
        'php': 'php',
        'rb': 'ruby',
        'sh': 'shell',
        'yml': 'yaml',
        'yaml': 'yaml',
        'xml': 'xml'
      };
      
      setLanguage(languageMap[extension || ''] || 'plaintext');
    }
  }, [selectedFile]);

  const handleEditorChange = (value: string | undefined) => {
    updateCurrentContent(value || '');
  };

  const handleTabClick = (path: string) => {
    const openFile = openFiles.get(path);
    if (openFile) {
      selectFile(openFile.item);
    }
  };

  const handleTabClose = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    closeFile(path);
  };

  const handleSave = useCallback(() => {
    if (selectedFile && currentFileContent !== undefined) {
      saveFile(selectedFile.path, currentFileContent);
    }
  }, [selectedFile, currentFileContent, saveFile]);

  // Handle Ctrl+S / Cmd+S for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, currentFileContent, saveFile, handleSave]);

  const getTabIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const iconMap: { [key: string]: string } = {
      'js': '🟨',
      'jsx': '🟨',
      'ts': '🟦',
      'tsx': '🟦',
      'json': '🟧',
      'html': '🟥',
      'css': '🟪',
      'scss': '🟪',
      'md': '📝',
      'txt': '📄',
      'py': '🐍',
      'java': '☕',
      'cpp': '⚙️',
      'c': '⚙️',
      'go': '🐹',
      'rs': '🦀',
      'php': '🐘',
      'rb': '💎',
      'sh': '🐚'
    };
    
    return iconMap[extension || ''] || '📄';
  };

  const isModified = (path: string) => {
    const openFile = openFiles.get(path);
    if (!openFile) return false;
    return selectedFile?.path === path && currentFileContent !== openFile.content;
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Tab Bar */}
      {openFiles.size > 0 && (
        <div className={`flex overflow-x-auto border-b ${
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200'
        }`}>
          {Array.from(openFiles.entries()).map(([path, openFile]) => {
            const isActive = selectedFile?.path === path;
            const modified = isModified(path);
            
            return (
              <div
                key={path}
                className={`flex items-center px-3 py-2 min-w-0 cursor-pointer border-r group ${
                  isActive
                    ? (isDark ? 'bg-gray-900 text-white border-gray-600' : 'bg-white text-black border-gray-300')
                    : (isDark ? 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-50 border-gray-200')
                }`}
                onClick={() => handleTabClick(path)}
              >
                <span className="mr-2 text-sm">
                  {getTabIcon(openFile.item.name)}
                </span>
                
                <span className="text-sm truncate max-w-32">
                  {openFile.item.name}
                </span>
                
                {modified && (
                  <span className="ml-1 text-orange-500 text-xs">●</span>
                )}
                
                <button
                  className={`ml-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-opacity-80 ${
                    isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-100 text-red-600'
                  }`}
                  onClick={(e) => handleTabClose(e, path)}
                  title="Close"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor Area */}
      <div className="flex-1 min-h-0">
        {selectedFile && selectedFile.type === 'file' ? (
          <div className="h-full flex flex-col">
            {/* File Info Bar */}
            <div className={`px-4 py-2 text-sm border-b ${
              isDark ? 'bg-gray-900 border-gray-700 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="mr-2">{getTabIcon(selectedFile.name)}</span>
                  <span className="font-medium">{selectedFile.name}</span>
                  <span className="ml-2 text-xs opacity-60">
                    {selectedFile.path}
                  </span>
                  {isModified(selectedFile.path) && (
                    <span className="ml-2 text-orange-500 text-xs">● Modified</span>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <span className="text-xs opacity-60">
                    {language}
                  </span>
                  <button
                    onClick={handleSave}
                    className={`px-2 py-1 text-xs rounded ${
                      isDark
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                    }`}
                    disabled={!isModified(selectedFile.path)}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>

            {/* Monaco Editor */}
            <div className="flex-1">
              <Editor
                height="100%"
                width="100%"
                theme={isDark ? "vs-dark" : "light"}
                language={language}
                value={currentFileContent}
                onChange={handleEditorChange}
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
          </div>
        ) : (
          <div className={`h-full flex items-center justify-center ${
            isDark ? 'bg-gray-900 text-gray-400' : 'bg-gray-50 text-gray-500'
          }`}>
            <div className="text-center">
              <div className="text-6xl mb-4">
                {selectedFile && selectedFile.type === 'folder' ? '📁' : '📝'}
              </div>
              <h3 className="text-lg font-medium mb-2">
                {selectedFile && selectedFile.type === 'folder' 
                  ? `Folder: ${selectedFile.name}` 
                  : 'No file selected'
                }
              </h3>
              <p className="text-sm">
                {selectedFile && selectedFile.type === 'folder' 
                  ? 'Select a file to start editing' 
                  : 'Select a file from the explorer to start editing'
                }
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
