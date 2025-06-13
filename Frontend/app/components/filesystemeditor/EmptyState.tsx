import { FileSystemItem } from '@/types/fileSystem';

interface EmptyStateProps {
  selectedFile?: FileSystemItem | null;
  isDark: boolean;
}

export function EmptyState({ selectedFile, isDark }: EmptyStateProps) {
  return (
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
  );
}
