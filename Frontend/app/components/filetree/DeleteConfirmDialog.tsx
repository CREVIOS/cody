'use client';

import { useTheme } from "@/context/ThemeContext";
import { X, AlertTriangle } from "lucide-react";

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  itemType: 'file' | 'folder';
}

export default function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  itemType,
}: DeleteConfirmDialogProps) {
  const { theme } = useTheme();

  // Theme classes
  const modalClass = theme === "dark"
    ? "bg-[#2A2A2E] border-[#3A3A3E] text-[#E0E0E0]"
    : "bg-white border-gray-300 text-[#2D2D2D]";

  const buttonPrimaryClass = theme === "dark"
    ? "bg-red-600/30 text-red-300 hover:bg-red-600/40 border border-red-600/50"
    : "bg-red-600 text-white hover:bg-red-700";

  const buttonSecondaryClass = theme === "dark"
    ? "bg-[#3A3A3E] text-[#E0E0E0] hover:bg-[#4A4A4E]"
    : "bg-gray-200 text-gray-700 hover:bg-gray-300";

  const borderClass = theme === "dark" ? "border-[#3A3A3E]" : "border-gray-200";

  const warningBgClass = theme === "dark"
    ? "bg-yellow-900/20 border-yellow-700/50"
    : "bg-yellow-50 border-yellow-200";

  const warningTextClass = theme === "dark"
    ? "text-yellow-300"
    : "text-yellow-800";

  const warningIconClass = theme === "dark"
    ? "text-yellow-400"
    : "text-yellow-600";

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-md rounded-xl shadow-xl border ${modalClass}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${borderClass}`}>
          <h2 className="text-xl font-semibold">Confirm Delete</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-full ${buttonSecondaryClass} transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Warning Message */}
          <div className={`p-4 rounded-lg border flex items-start gap-3 ${warningBgClass}`}>
            <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${warningIconClass} mt-0.5`} />
            <div>
              <p className={`text-sm font-medium ${warningTextClass} mb-1`}>
                Warning: This action cannot be undone
              </p>
              <p className={`text-sm ${warningTextClass} opacity-90`}>
                Are you sure you want to delete <span className="font-semibold">"{itemName}"</span>?
                {itemType === 'folder' && ' This will delete all contents inside the folder.'}
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg ${buttonSecondaryClass} transition-all text-sm font-medium`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`px-4 py-2 rounded-lg ${buttonPrimaryClass} transition-all text-sm font-medium`}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

