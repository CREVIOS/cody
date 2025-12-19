import React, { useState, useEffect } from 'react';
import { X, Bell, Save, LayoutGrid } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme = 'light'
}) => {
  const [notifications, setNotifications] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Theme classes
  const isDark = theme === 'dark';
  const modalBg = isDark ? 'bg-[#2A2A2E]' : 'bg-white';
  const overlayBg = isDark ? 'bg-black/50' : 'bg-black/30';
  const textColor = isDark ? 'text-[#E0E0E0]' : 'text-[#2D2D2D]';
  const textSecondary = isDark ? 'text-[#A0A0A0]' : 'text-gray-600';
  const borderColor = isDark ? 'border-[#3A3A3E]' : 'border-gray-200';
  const buttonSecondary = isDark ? 'bg-[#3A3A3E] hover:bg-[#4A4A4E]' : 'bg-gray-200 hover:bg-gray-300';
  const hoverBg = isDark ? 'hover:bg-[#3A3A3E]/50' : 'hover:bg-gray-50';

  // Animation on mount
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const ToggleButton = ({ 
    enabled, 
    onToggle, 
    label, 
    description,
    icon: Icon 
  }: { 
    enabled: boolean; 
    onToggle: () => void; 
    label: string;
    description?: string;
    icon: React.ElementType;
  }) => (
    <div 
      className={`flex items-center justify-between py-4 px-1 transition-all duration-200 rounded-lg ${hoverBg} cursor-pointer group`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`p-2 rounded-lg transition-colors ${
          enabled 
            ? isDark ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-100 text-indigo-600'
            : isDark ? 'bg-[#3A3A3E] text-[#A0A0A0]' : 'bg-gray-100 text-gray-400'
        }`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-medium ${textColor} text-sm sm:text-base`}>{label}</div>
          {description && (
            <div className={`text-xs sm:text-sm mt-0.5 ${textSecondary}`}>{description}</div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`relative inline-flex h-7 w-12 sm:h-6 sm:w-11 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
          enabled 
            ? 'bg-indigo-600 shadow-lg shadow-indigo-500/30' 
            : isDark ? 'bg-[#3A3A3E]' : 'bg-gray-300'
        }`}
        aria-label={`Toggle ${label}`}
      >
        <span
          className={`inline-block h-5 w-5 sm:h-4 sm:w-4 transform rounded-full bg-white shadow-md transition-all duration-300 ${
            enabled ? 'translate-x-6 sm:translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${overlayBg} transition-opacity duration-300 ${
        isAnimating ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className={`relative w-full max-w-md ${modalBg} rounded-xl sm:rounded-2xl shadow-2xl transition-all duration-300 ${
          isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-5 sm:p-6 border-b ${borderColor}`}>
          <div>
            <h2 className={`text-xl sm:text-2xl font-semibold ${textColor}`}>Settings</h2>
            <p className={`text-xs sm:text-sm mt-1 ${textSecondary}`}>Manage your preferences</p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${isDark ? 'hover:bg-[#3A3A3E]' : 'hover:bg-gray-100'} transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50`}
            aria-label="Close settings"
          >
            <X className={`w-5 h-5 ${textColor}`} />
          </button>
        </div>

        {/* Settings Content */}
        <div className="p-5 sm:p-6 space-y-2">
          <ToggleButton
            enabled={notifications}
            onToggle={() => setNotifications(!notifications)}
            label="Notifications"
            description="Receive updates and alerts"
            icon={Bell}
          />
          <ToggleButton
            enabled={autoSave}
            onToggle={() => setAutoSave(!autoSave)}
            label="Auto-save"
            description="Automatically save your work"
            icon={Save}
          />
          <ToggleButton
            enabled={compactMode}
            onToggle={() => setCompactMode(!compactMode)}
            label="Compact mode"
            description="Use a more compact interface"
            icon={LayoutGrid}
          />
        </div>

        {/* Footer */}
        <div className={`flex justify-end gap-3 p-5 sm:p-6 border-t ${borderColor}`}>
          <button
            onClick={onClose}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${buttonSecondary} ${textColor} focus:outline-none focus:ring-2 focus:ring-indigo-500/50 hover:scale-105 active:scale-95`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;

