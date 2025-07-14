import { useRef, useEffect } from 'react';

interface UserMenuProps {
  menuOpen: boolean;
  onToggleMenu: () => void;
  theme: string;
  borderClass: string;
  menuBgClass: string;
  menuHoverClass: string;
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
  onLogoutClick?: () => void;
}

export function UserMenu({ 
  menuOpen, 
  onToggleMenu, 
  theme, 
  borderClass, 
  menuBgClass, 
  menuHoverClass,
  onProfileClick,
  onSettingsClick,
  onLogoutClick
}: UserMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) {
        onToggleMenu();
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen, onToggleMenu]);

  return (
    <div className="relative">
      <button
        onClick={onToggleMenu}
        className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-opacity-20 hover:bg-gray-500 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A4 4 0 017 17h10a4 4 0 011.879.804M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {menuOpen && (
        <div ref={menuRef} className={`absolute top-16 right-0 w-48 ${menuBgClass} border ${borderClass} rounded-xl shadow-lg z-10 overflow-hidden before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-b ${theme === "dark" ? "before:from-[#ffffff15] before:to-transparent" : "before:from-[#ffffff80] before:to-transparent"} before:z-[-1]`}>
          <ul className="text-sm relative z-10">
            <li 
              className={`px-4 py-3 ${menuHoverClass} cursor-pointer flex items-center gap-2`}
              onClick={() => {
                if (onProfileClick) {
                  onProfileClick();
                }
                onToggleMenu();
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </li>
            <li 
              className={`px-4 py-3 ${menuHoverClass} cursor-pointer flex items-center gap-2`}
              onClick={() => {
                if (onSettingsClick) {
                  onSettingsClick();
                }
                onToggleMenu();
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </li>
            <li 
              className={`px-4 py-3 ${theme === "dark" ? "hover:bg-red-900/30 text-red-400" : "hover:bg-red-100 text-red-600"} cursor-pointer flex items-center gap-2`}
              onClick={() => {
                if (onLogoutClick) {
                  onLogoutClick();
                }
                onToggleMenu();
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Log out
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}