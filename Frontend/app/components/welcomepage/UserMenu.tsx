import { useRef, useEffect } from 'react';

interface UserMenuProps {
  menuOpen: boolean;
  onToggleMenu: () => void;
  theme: string;
  borderClass: string;
  menuBgClass: string;
  menuHoverClass: string;
}

export function UserMenu({ 
  menuOpen, 
  onToggleMenu, 
  theme, 
  borderClass, 
  menuBgClass, 
  menuHoverClass 
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
            <li className={`px-4 py-3 ${menuHoverClass} cursor-pointer`}>Profile</li>
            <li className={`px-4 py-3 ${menuHoverClass} cursor-pointer`}>Settings</li>
            <li className={`px-4 py-3 ${theme === "dark" ? "hover:bg-red-900/30 text-red-400" : "hover:bg-red-100 text-red-600"} cursor-pointer`}>Log out</li>
          </ul>
        </div>
      )}
    </div>
  );
}