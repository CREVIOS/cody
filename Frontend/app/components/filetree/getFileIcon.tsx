export const getFileIcon = (fileName: string, isFolder: boolean = false, isExpanded: boolean = false) => {
    if (isFolder) {
      return isExpanded ? '📂' : '📁';
    }
    
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconMap: Record<string, string> = {
      // Programming languages
      'js': '🟨',
      'jsx': '⚛️', 
      'ts': '🔷',
      'tsx': '⚛️',
      'vue': '💚',
      'py': '🐍',
      'java': '☕',
      'cpp': '⚙️',
      'c': '⚙️',
      'go': '🐹',
      'rs': '🦀',
      'php': '🐘',
      'rb': '💎',
      'swift': '🦉',
      'kt': '🟣',
      
      // Web technologies
      'html': '🌐',
      'css': '🎨',
      'scss': '🎨',
      'sass': '🎨',
      'less': '🎨',
      
      // Data formats
      'json': '📋',
      'xml': '📄',
      'yaml': '📄',
      'yml': '📄',
      'toml': '📄',
      'ini': '🔧',
      'env': '🔧',
      
      // Documentation
      'md': '📝',
      'mdx': '📝',
      'txt': '📄',
      'rst': '📝',
      
      // Images
      'png': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'gif': '🖼️',
      'svg': '🖼️',
      'ico': '🖼️',
      'webp': '🖼️',
      
      // Config files
      'gitignore': '🚫',
      'dockerfile': '🐳',
      'dockerignore': '🐳',
      'npmrc': '📦',
      'yarnrc': '🧶',
      
      // Special files
      'lock': '🔒',
      'log': '📜',
      'sql': '🗄️',
    };
    
    // Handle special cases
    if (fileName === 'package.json') return '📦';
    if (fileName === 'tsconfig.json') return '🔷';
    if (fileName === 'README.md') return '📖';
    if (fileName === 'LICENSE') return '📄';
    if (fileName.startsWith('.env')) return '🔧';
    if (fileName.startsWith('Dockerfile')) return '🐳';
    
    return iconMap[ext || ''] || '📄';
  };