import { FileSystemItem } from "@/types/fileSystem";
import { useEffect, useRef } from "react";

interface ContextMenuProps {
    x: number;
    y: number;
    item: FileSystemItem;
    onClose: () => void;
    onAction: (action: string, item: FileSystemItem) => void;
    isDark: boolean;
  }
  
export function ContextMenu({ x, y, item, onClose, onAction, isDark }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
  
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          onClose();
        }
      };
  
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onClose();
        }
      };
  
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [onClose]);
  
    const menuItems = [
      { label: 'Rename', action: 'rename', icon: '✏️' },
      { label: 'Delete', action: 'delete', icon: '🗑️', danger: true },
      { type: 'separator' },
      { 
        label: item.type === 'folder' ? 'New File' : 'New File Here', 
        action: 'newFile', 
        icon: '📄' 
      },
      { 
        label: item.type === 'folder' ? 'New Folder' : 'New Folder Here', 
        action: 'newFolder', 
        icon: '📁' 
      },
      { type: 'separator' },
      { label: 'Copy Path', action: 'copyPath', icon: '📋' },
      { label: 'Copy Relative Path', action: 'copyRelativePath', icon: '📋' },
    ];
  
    return (
      <div
        ref={menuRef}
        className={`fixed z-50 py-1 rounded-md shadow-lg border min-w-[180px] ${
          isDark 
            ? 'bg-[#2d2d30] border-[#3e3e42] text-[#cccccc]' 
            : 'bg-[#ffffff] border-[#e5e5e5] text-[#383838]'
        }`}
        style={{ 
          left: Math.min(x, window.innerWidth - 200), 
          top: Math.min(y, window.innerHeight - 200) 
        }}
      >
        {menuItems.map((menuItem, index) => {
          if (menuItem.type === 'separator') {
            return (
              <div key={index} className={`h-px mx-2 my-1 ${
                isDark ? 'bg-[#3e3e42]' : 'bg-[#e5e5e5]'
              }`} />
            );
          }
          
          return (
            <button
              key={index}
              className={`w-full flex items-center px-3 py-1.5 text-sm transition-colors ${
                menuItem.danger 
                  ? (isDark 
                      ? 'hover:bg-[#5a1d1d] text-[#f48771]' 
                      : 'hover:bg-[#f2dede] text-[#cd3131]'
                    )
                  : (isDark 
                      ? 'hover:bg-[#37373d]' 
                      : 'hover:bg-[#f3f3f3]'
                    )
              }`}
              onClick={() => {
                if (menuItem.action) {
                  onAction(menuItem.action, item);
                }
                onClose();
              }}
            >
              <span className="mr-2 text-xs">{menuItem.icon}</span>
              <span>{menuItem.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  