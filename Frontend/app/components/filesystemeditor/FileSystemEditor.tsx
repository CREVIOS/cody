import React from "react";
import { useTheme } from "@/context/ThemeContext";
import { TabBar } from "./TabBar";
import { EditorArea } from "./EditorArea";

interface FileSystemEditorProps {
  className?: string;
}

export default function FileSystemEditor({ className = "" }: FileSystemEditorProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <TabBar isDark={isDark} />
      <EditorArea isDark={isDark} />
    </div>
  );
}