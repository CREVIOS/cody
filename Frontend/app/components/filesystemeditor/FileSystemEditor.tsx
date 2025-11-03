import React from "react";
import { useTheme } from "@/context/ThemeContext";
import { TabBar } from "./TabBar";
import { EditorArea } from "./EditorArea";
import { User } from "@/lib/projectAPI/TypeDefinitions";

interface FileSystemEditorProps {
  className?: string;
  projectId?: string;
  user?: User;
  userRole?: string;
}

export default function FileSystemEditor({ 
  className = "", 
  projectId, 
  user, 
  userRole 
}: FileSystemEditorProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <TabBar isDark={isDark} />
      <EditorArea 
        isDark={isDark} 
        projectId={projectId} 
        user={user} 
        userRole={userRole} 
      />
    </div>
  );
}