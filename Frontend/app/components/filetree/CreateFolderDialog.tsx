'use client';

import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { X } from "lucide-react";

interface CreateFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (folderName: string) => void;
  basePath?: string;
}

export default function CreateFolderDialog({
  isOpen,
  onClose,
  onSubmit,
  basePath = '',
}: CreateFolderDialogProps) {
  const { theme } = useTheme();
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setFolderName("");
      setError(null);
    }
  }, [isOpen]);

  // Theme classes
  const modalClass = theme === "dark"
    ? "bg-[#2A2A2E] border-[#3A3A3E] text-[#E0E0E0]"
    : "bg-white border-gray-300 text-[#2D2D2D]";

  const inputClass = theme === "dark"
    ? "bg-[#2A2A2E] border-[#3A3A3E] focus:border-indigo-500/50 text-[#E0E0E0]"
    : "bg-white border-gray-300 focus:border-indigo-500 text-[#2D2D2D]";

  const buttonPrimaryClass = theme === "dark"
    ? "bg-indigo-500/30 text-indigo-200 hover:bg-indigo-500/40"
    : "bg-indigo-500/80 text-white hover:bg-indigo-600";

  const buttonSecondaryClass = theme === "dark"
    ? "bg-[#3A3A3E] text-[#E0E0E0] hover:bg-[#4A4A4E]"
    : "bg-gray-200 text-gray-700 hover:bg-gray-300";

  const borderClass = theme === "dark" ? "border-[#3A3A3E]" : "border-gray-200";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedName = folderName.trim();
    if (!trimmedName) {
      setError("Folder name cannot be empty");
      return;
    }

    // Basic validation for invalid characters
    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      setError("Folder name cannot contain slashes");
      return;
    }

    onSubmit(trimmedName);
    setFolderName("");
    setError(null);
    onClose();
  };

  const handleClose = () => {
    setFolderName("");
    setError(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div 
        className={`w-full max-w-md rounded-xl shadow-xl border ${modalClass}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${borderClass}`}>
          <h2 className="text-xl font-semibold">Create New Folder</h2>
          <button
            onClick={handleClose}
            className={`p-2 rounded-full ${buttonSecondaryClass} transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Folder Name
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                setError(null);
              }}
              placeholder="Enter folder name..."
              className={`w-full px-3 py-2 rounded-lg border ${inputClass} focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all`}
              autoFocus
            />
            {basePath && (
              <p className="text-xs mt-1 opacity-70">
                Will be created in: {basePath || 'root'}
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className={`p-3 rounded-lg text-sm ${
              theme === "dark" 
                ? "bg-red-900/20 text-red-400 border border-red-800/50" 
                : "bg-red-100 text-red-700"
            }`}>
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className={`px-4 py-2 rounded-lg ${buttonSecondaryClass} transition-all text-sm font-medium`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!folderName.trim()}
              className={`px-4 py-2 rounded-lg ${buttonPrimaryClass} transition-all text-sm font-medium ${
                !folderName.trim() ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

