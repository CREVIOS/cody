import { useEffect, useState } from 'react';
import { FileTypeAPI } from '../../lib/projectAPI/FileTypeAPI';

// Cache for file icons to avoid repeated API calls
const iconCache = new Map<string, string>();
let fileTypesLoaded = false;

// Return synchronous icon result for folders and known file types
export function getSimpleFileIcon(fileName: string, isFolder: boolean = false, isExpanded: boolean = false): string | null {
  if (isFolder) {
    return isExpanded ? '📂' : '📁';
  }
  
  // Handle special cases
  if (fileName === 'package.json') return '📦';
  if (fileName === 'tsconfig.json') return '🔷';
  if (fileName === 'README.md') return '📖';
  if (fileName === 'LICENSE') return '📄';
  if (fileName.startsWith('.env')) return '🔧';
  if (fileName.startsWith('Dockerfile')) return '🐳';

  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return '📄';
  
  // Check if we already have this icon cached
  if (iconCache.has(ext)) {
    return iconCache.get(ext) || '📄';
  }
  
  return null; // Not found synchronously
}

// This function will be called by hooks, not directly in render
export const getFileIcon = async (fileName: string, isFolder: boolean = false, isExpanded: boolean = false): Promise<string> => {
  // Try to get synchronous result first
  const simpleIcon = getSimpleFileIcon(fileName, isFolder, isExpanded);
  if (simpleIcon) return simpleIcon;
  
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return '📄';
  
  // Get file type from API
  try {
    if (!fileTypesLoaded) {
      const fileTypes = await FileTypeAPI.getAllFileTypes();
      fileTypes.forEach(type => {
        if (type.icon_class) {
          iconCache.set(type.extension.toLowerCase(), type.icon_class);
        }
      });
      fileTypesLoaded = true;
    }
    
    // Check cache again after loading
    if (iconCache.has(ext)) {
      return iconCache.get(ext) || '📄';
    }
    
    const fileType = await FileTypeAPI.getFileTypeByExtension(ext);
    if (fileType && fileType.icon_class) {
      iconCache.set(ext, fileType.icon_class);
      return fileType.icon_class;
    }
  } catch (error) {
    console.error('Error fetching file icon:', error);
  }
  
  return '📄'; // Default icon for unknown file types
};

// React hook version for components
export function useFileIcon(fileName: string, isFolder: boolean = false, isExpanded: boolean = false): string {
  const [icon, setIcon] = useState<string>(() => {
    // Try to get synchronous icon first
    return getSimpleFileIcon(fileName, isFolder, isExpanded) || (isFolder ? (isExpanded ? '📂' : '📁') : '📄');
  });
  
  useEffect(() => {
    if (isFolder) {
      setIcon(isExpanded ? '📂' : '📁');
      return;
    }
    
    // Try to get a synchronous result first
    const simpleIcon = getSimpleFileIcon(fileName, isFolder, isExpanded);
    if (simpleIcon) {
      setIcon(simpleIcon);
      return;
    }
    
    // If not available synchronously, fetch asynchronously
    let isMounted = true;
    const fetchIcon = async () => {
      const fileIcon = await getFileIcon(fileName, isFolder, isExpanded);
      if (isMounted) {
        setIcon(fileIcon);
      }
    };
    
    fetchIcon();
    
    return () => {
      isMounted = false;
    };
  }, [fileName, isFolder, isExpanded]);
  
  return icon;
};