export function getLanguageFromExtension(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  
  const languageMap: { [key: string]: string } = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'md': 'markdown',
    'py': 'python',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'rb': 'ruby',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'yml': 'yaml',
    'yaml': 'yaml',
    'xml': 'xml',
    'sql': 'sql',
    'graphql': 'graphql',
    'vue': 'vue',
    'svelte': 'svelte',
    'astro': 'astro',
    'toml': 'toml',
    'ini': 'ini',
    'env': 'plaintext',
    'txt': 'plaintext',
  };

  return languageMap[extension || ''] || 'plaintext';
}