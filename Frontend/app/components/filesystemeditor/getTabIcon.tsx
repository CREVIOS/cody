export const getTabIcon = (fileName: string) => {
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