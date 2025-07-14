interface EmptyStateProps {
    onCreateFile: () => void;
    onCreateFolder: () => void;
    isDark: boolean;
  }
  
export function EmptyState({ onCreateFile, onCreateFolder, isDark }: EmptyStateProps) {
    return (
      <div className="p-4 text-center">
        <div className="text-4xl mb-2">📁</div>
        <div className={`text-sm mb-3 ${
          isDark ? 'text-[#858585]' : 'text-[#6c6c6c]'
        }`}>
          No files found
        </div>
        <div className="space-y-2">
          <button
            onClick={onCreateFile}
            className={`block w-full text-sm px-3 py-2 rounded border transition-colors ${
              isDark 
                ? 'border-[#3e3e42] text-[#cccccc] hover:bg-[#2a2d2e]' 
                : 'border-[#e5e5e5] text-[#383838] hover:bg-[#f3f3f3]'
            }`}
          >
            Create your first file
          </button>
          <button
            onClick={onCreateFolder}
            className={`block w-full text-sm px-3 py-2 rounded border transition-colors ${
              isDark 
                ? 'border-[#3e3e42] text-[#cccccc] hover:bg-[#2a2d2e]' 
                : 'border-[#e5e5e5] text-[#383838] hover:bg-[#f3f3f3]'
            }`}
          >
            Create a folder
          </button>
        </div>
      </div>
    );
  }