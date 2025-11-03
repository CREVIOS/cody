import { FileSystemItem } from '@/types/fileSystem';
import { useFileSystem } from '@/context/FileSystemContext';

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
  const { selectFile, openFile } = useFileSystem();

  // Create breadcrumb segments from the file path
  const createBreadcrumbs = (path: string) => {
    const segments = path.split('/').filter(segment => segment.length > 0);
    const breadcrumbs = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segmentPath = segments.slice(0, i + 1).join('/');
      const isFile = i === segments.length - 1;
      
      breadcrumbs.push({
        name: segments[i],
        path: segmentPath,
        isFile,
        isLast: i === segments.length - 1
      });
    }
    
    return breadcrumbs;
  };

  const breadcrumbs = createBreadcrumbs(selectedFile.path);

  const handleBreadcrumbClick = (breadcrumb: any) => {
    if (breadcrumb.isFile) {
      // If it's a file, open it
      openFile(selectedFile);
    } else {
      // If it's a folder, we could potentially navigate to it
      // For now, we'll just select it (this could be enhanced later)
      const folderItem: FileSystemItem = {
        name: breadcrumb.name,
        path: breadcrumb.path,
        type: 'folder'
      };
      selectFile(folderItem);
    }
  };

  return (
    <div className={`px-4 py-2 text-sm border-b shrink-0 ${
      isDark 
        ? 'bg-[#1e1e1e] border-[#3e3e42] text-[#cccccc]' 
        : 'bg-[#ffffff] border-[#e5e5e5] text-[#383838]'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center min-w-0 flex-1">
          {/* Breadcrumb navigation */}
          <div className="flex items-center min-w-0 flex-1">
            {breadcrumbs.map((breadcrumb, index) => (
              <div key={breadcrumb.path} className="flex items-center min-w-0">
                <button
                  onClick={() => handleBreadcrumbClick(breadcrumb)}
                  className={`text-sm truncate transition-colors duration-150 ${
                    breadcrumb.isLast
                      ? (isDark ? 'text-[#ffffff] font-medium' : 'text-[#333333] font-medium')
                      : (isDark 
                          ? 'text-[#969696] hover:text-[#cccccc] hover:bg-[#2a2d2e] px-1 py-0.5 rounded' 
                          : 'text-[#616161] hover:text-[#333333] hover:bg-[#e8e8e8] px-1 py-0.5 rounded'
                        )
                  }`}
                  title={breadcrumb.path}
                >
                  {breadcrumb.name}
                </button>
                {!breadcrumb.isLast && (
                  <span className={`mx-1.5 text-xs ${
                    isDark ? 'text-[#616161]' : 'text-[#969696]'
                  }`}>
                    ›
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Modified indicator */}
          {isModified && (
            <span className={`ml-3 text-xs px-2 py-0.5 rounded ${
              isDark 
                ? 'bg-[#5a5a00] text-[#ffff00]' 
                : 'bg-[#fff3cd] text-[#856404]'
            }`}>
              ● Modified
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2 ml-4 shrink-0">
          {/* Language indicator */}
          <span className={`text-xs px-2 py-0.5 rounded ${
            isDark 
              ? 'bg-[#2d2d30] text-[#969696] border border-[#3e3e42]' 
              : 'bg-[#f3f3f3] text-[#616161] border border-[#e5e5e5]'
          }`}>
            {language.toUpperCase()}
          </span>
          
          {/* Save button */}
          <button
            onClick={onSave}
            className={`px-3 py-1 text-xs rounded transition-colors duration-150 font-medium ${
              isModified
                ? (isDark
                    ? 'bg-[#0e639c] hover:bg-[#1177bb] text-[#ffffff]'
                    : 'bg-[#007acc] hover:bg-[#005a9e] text-[#ffffff]'
                  )
                : (isDark
                    ? 'bg-[#3e3e42] text-[#969696] cursor-not-allowed opacity-60'
                    : 'bg-[#e5e5e5] text-[#969696] cursor-not-allowed opacity-60'
                  )
            }`}
            disabled={!isModified}
          >
            {isModified ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
    </div>
  );
}