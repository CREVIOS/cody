import { useEffect, useState } from 'react';
import { getFileIcon, getSimpleFileIcon } from '../filetree/getFileIcon';

// React hook version for components
export function useTabIcon(fileName: string): string {
  const [icon, setIcon] = useState<string>(() => {
    // Try to get synchronous icon first
    return getSimpleFileIcon(fileName) || '📄';
  });
  
  useEffect(() => {
    // Try to get a synchronous result first
    const simpleIcon = getSimpleFileIcon(fileName);
    if (simpleIcon) {
      setIcon(simpleIcon);
      return;
    }
    
    // If not available synchronously, fetch asynchronously
    let isMounted = true;
    const fetchIcon = async () => {
      const fileIcon = await getFileIcon(fileName);
      if (isMounted) {
        setIcon(fileIcon);
      }
    };
    
    fetchIcon();
    
    return () => {
      isMounted = false;
    };
  }, [fileName]);
  
  return icon;
};