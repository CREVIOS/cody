interface EmptyStateProps {
    onCreateFile: () => void;
    onCreateFolder: () => void;
    isDark: boolean;
  }
  
export function EmptyState({ onCreateFile, onCreateFolder, isDark }: EmptyStateProps) {
    return (
      <div className="p-4 text-center">
        <div className="text-4xl mb-2">📁</div>
        <div className="text-sm text-gray-500 mb-3">
          No files found
        </div>
        <div className="space-y-2">
          <button
            onClick={onCreateFile}
            className={`block w-full text-sm px-3 py-2 rounded border transition-colors ${
              isDark 
                ? 'border-gray-600 text-gray-300 hover:bg-gray-800' 
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Create your first file
          </button>
          <button
            onClick={onCreateFolder}
            className={`block w-full text-sm px-3 py-2 rounded border transition-colors ${
              isDark 
                ? 'border-gray-600 text-gray-300 hover:bg-gray-800' 
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Create a folder
          </button>
        </div>
      </div>
    );
  }