import { useFileSystem } from "@/context/FileSystemContext";
import { FileTab } from "./FileTab";


interface TabBarProps {
  isDark: boolean;
}

export function TabBar({ isDark }: TabBarProps) {
  const { 
    selectedFile, 
    currentFileContent, 
    openFiles,
    selectFile,
    closeFile
  } = useFileSystem();

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

  const isModified = (path: string) => {
    const openFile = openFiles.get(path);
    if (!openFile) return false;
    return selectedFile?.path === path && currentFileContent !== openFile.content;
  };

  if (openFiles.size === 0) return null;

  return (
    <div className={`flex overflow-x-auto border-b ${
      isDark 
        ? 'bg-[#2d2d30] border-[#3e3e42]' 
        : 'bg-[#f3f3f3] border-[#e5e5e5]'
    }`}>
      {Array.from(openFiles.entries()).map(([path, openFile]) => {
        const isActive = selectedFile?.path === path;
        const modified = isModified(path);
        
        return (
          <FileTab
            key={path}
            path={path}
            fileName={openFile.item.name}
            isActive={isActive}
            isModified={modified}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            isDark={isDark}
          />
        );
      })}
    </div>
  );
}
