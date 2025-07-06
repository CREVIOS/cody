import { FileSystemItem } from '@/types/fileSystem';

interface FileInfoBarProps {
  selectedFile: FileSystemItem;
  language: string;
  isModified: boolean;
  onSave: () => void;
  isDark: boolean;
}

export function FileInfoBar({ 
  selectedFile, 
  language, 
  isModified, 
  onSave, 
  isDark 
}: FileInfoBarProps) {
  return (
    <div className={`px-4 py-2 text-sm border-b ${
      isDark ? 'bg-gray-900 border-gray-700 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="font-medium">{selectedFile.name}</span>
          <span className="ml-2 text-xs opacity-60">
            {selectedFile.path}
          </span>
          {isModified && (
            <span className="ml-2 text-orange-500 text-xs">● Modified</span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-xs opacity-60">
            {language}
          </span>
          <button
            onClick={onSave}
            className={`px-2 py-1 text-xs rounded ${
              isDark
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-indigo-500 hover:bg-indigo-600 text-white'
            }`}
            disabled={!isModified}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}