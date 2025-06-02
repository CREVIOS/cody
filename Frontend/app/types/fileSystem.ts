export interface FileSystemItem {
  name: string;
  type: 'file' | 'folder';
  path: string;
  size?: number;
  lastModified?: Date;
  children?: FileSystemItem[];
  isExpanded?: boolean;
}

export interface SearchMatch {
  lineNumber: number;
  content: string;
  startColumn: number;
}

export interface SearchResult {
  name: string;
  path: string;
  size?: number;
  lastModified?: Date;
  searchType: 'filename' | 'content';
  matches?: SearchMatch[];
}

export interface FileMetadata {
  size: number;
  lastModified: Date;
  etag: string;
  metaData: Record<string, string>;
}

export interface FileSystemContextType {
  projectId: string;
  projectName: string;
  fileTree: FileSystemItem[];
  selectedFile: FileSystemItem | null;
  openFiles: Map<string, { item: FileSystemItem; content: string; isDirty: boolean }>;
  currentFileContent: string;
  isLoading: boolean;
  error: string | null;
  expandedFolders: Set<string>;
  
  // Actions
  loadFileTree: () => Promise<void>;
  createFile: (path: string, content?: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  openFile: (item: FileSystemItem) => Promise<void>;
  saveFile: (path: string, content: string) => Promise<void>;
  deleteItem: (path: string) => Promise<void>;
  renameItem: (oldPath: string, newPath: string) => Promise<void>;
  copyItem: (sourcePath: string, destinationPath: string) => Promise<void>;
  moveItem: (sourcePath: string, destinationPath: string) => Promise<void>;
  closeFile: (path: string) => void;
  closeAllFiles: () => void;
  selectFile: (item: FileSystemItem | null) => void;
  updateCurrentContent: (content: string) => void;
  searchFiles: (query: string) => Promise<SearchResult[]>;
  getFileMetadata: (path: string) => Promise<FileMetadata>;
  setExpandedFolders: (folders: Set<string>) => void;
  
  // File management
  saveAllFiles: () => Promise<void>;
  revertFile: (path: string) => Promise<void>;
  duplicateFile: (path: string) => Promise<void>;
}
