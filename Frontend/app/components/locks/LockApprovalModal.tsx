"use client";

import { useState, useEffect } from "react";
import { X, Lock, AlertTriangle } from "lucide-react";
import { Theme } from "@/context/ThemeContext";
import { ErrorDisplay } from "../invitation/ErrorDisplay";
import { API_BASE_URL } from "@/lib/projectAPI/APIConfiguration";
import { getErrorMessage } from "@/lib/projectAPI/ErrorHandling";

interface LockInfo {
  file_id: string;
  file_path?: string;
  holder_user_id: string;
  holder_name?: string;
  expires_at?: string;
}

interface LockApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  userId: string;
  theme: Theme;
  onLockReleased?: () => void;
}

export default function LockApprovalModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  userId,
  theme,
  onLockReleased,
}: LockApprovalModalProps) {
  const [locks, setLocks] = useState<LockInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [releasingLockId, setReleasingLockId] = useState<string | null>(null);

  // Don't check permissions here - the modal is already wrapped in PermissionGate in Layout.tsx
  // If the modal is open, the user already has permission
  useEffect(() => {
    if (isOpen && projectId) {
      // Load locks asynchronously after modal is shown (don't block modal rendering)
      // Note: This would require a backend endpoint to get all locked files
      // For now, we'll show a placeholder message
      setLoading(true);
      // Use setTimeout to allow modal to render first, then load data
      setTimeout(() => {
        loadLocks();
      }, 0);
    }
  }, [isOpen, projectId]);

  const loadLocks = async () => {
    // TODO: Implement when backend endpoint is available
    // For now, show empty state
    setLocks([]);
    setLoading(false);
  };

  const handleReleaseLock = async (fileId: string) => {
    // Permission is already checked by PermissionGate wrapper - if modal is open, user has permission
    setReleasingLockId(fileId);
    setError(null);

    try {
      // Release lock by requesting it (owners can preempt)
      const response = await fetch(`${API_BASE_URL}/api/v1/locks/${fileId}/release`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId }),
      });

      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }

      // Reload locks
      await loadLocks();
      if (onLockReleased) {
        onLockReleased();
      }
    } catch (err) {
      console.error("Error releasing lock:", err);
      setError(err instanceof Error ? err.message : "Failed to release lock");
    } finally {
      setReleasingLockId(null);
    }
  };

  if (!isOpen) return null;

  const isDark = theme === "dark";
  const modalBg = isDark ? "bg-[#1E1E1E]" : "bg-white";
  const borderClass = isDark ? "border-[#3A3A3E]" : "border-gray-200";
  const textClass = isDark ? "text-[#E0E0E0]" : "text-[#2D2D2D]";
  const inputClass = isDark
    ? "bg-[#2A2A2E] border-[#3A3A3E] text-[#E0E0E0]"
    : "bg-white border-gray-300 text-[#2D2D2D]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={`${modalBg} rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col ${borderClass} border`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${borderClass}`}>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            <h2 className={`text-lg font-semibold ${textClass}`}>Lock Approval</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-md hover:bg-opacity-20 ${
              isDark ? "hover:bg-white" : "hover:bg-gray-200"
            } transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Message */}
        <div
          className={`mx-4 mt-4 p-3 rounded-md flex items-start gap-2 ${
            isDark
              ? "bg-yellow-900/20 border border-yellow-700/50"
              : "bg-yellow-50 border border-yellow-200"
          }`}
        >
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
            isDark ? "text-yellow-400" : "text-yellow-600"
          }`} />
          <p className={`text-sm ${
            isDark ? "text-yellow-300" : "text-yellow-800"
          }`}>
            <strong>Warning:</strong> Releasing a lock will allow other users to edit the file. 
            Make sure the current editor has saved their work before releasing.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && <ErrorDisplay error={error} theme={theme} />}

          {loading ? (
            <div className={`text-center py-8 ${textClass}`}>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current mx-auto mb-2"></div>
              <p>Loading locks...</p>
            </div>
          ) : locks.length === 0 ? (
            <div className={`text-center py-8 ${textClass}`}>
              <Lock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="mb-2">No active locks found</p>
              <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                All files are currently unlocked and available for editing.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {locks.map((lock) => {
                const isReleasing = releasingLockId === lock.file_id;
                const expiresAt = lock.expires_at ? new Date(lock.expires_at) : null;
                const isExpired = expiresAt ? expiresAt < new Date() : false;

                return (
                  <div
                    key={lock.file_id}
                    className={`p-3 rounded-md border ${borderClass} ${
                      isDark ? "bg-[#2A2A2E]" : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className={`font-medium ${textClass}`}>
                          {lock.file_path || `File ${lock.file_id.substring(0, 8)}...`}
                        </p>
                        <p className={`text-sm mt-1 ${
                          isDark ? "text-gray-400" : "text-gray-600"
                        }`}>
                          Locked by: {lock.holder_name || "Unknown User"}
                        </p>
                        {expiresAt && (
                          <p className={`text-xs mt-1 ${
                            isExpired
                              ? isDark ? "text-red-400" : "text-red-600"
                              : isDark ? "text-gray-500" : "text-gray-500"
                          }`}>
                            Expires: {expiresAt.toLocaleString()}
                            {isExpired && " (Expired)"}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleReleaseLock(lock.file_id)}
                        disabled={isReleasing}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          isDark
                            ? "bg-red-900/30 hover:bg-red-900/50 text-red-400"
                            : "bg-red-100 hover:bg-red-200 text-red-600"
                        } ${isReleasing ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {isReleasing ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                            Releasing...
                          </div>
                        ) : (
                          "Release Lock"
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${borderClass} flex justify-end`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              isDark
                ? "bg-[#3A3A3E] hover:bg-[#4A4A4E] text-[#E0E0E0]"
                : "bg-gray-200 hover:bg-gray-300 text-[#2D2D2D]"
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

