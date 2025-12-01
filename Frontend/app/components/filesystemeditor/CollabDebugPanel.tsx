/**
 * Collaboration Debug Panel
 * 
 * Phase 7: Developer tool for debugging CRDT, locks, and versioning.
 * Shows real-time state of collaboration features.
 * 
 * Manual Testing Checklist:
 * 1. CRDT Sync: Open same file in two browsers, type in one, confirm other updates live
 * 2. Lock behavior: Tab A acquires lock, Tab B sees read-only and "Locked by ..."
 * 3. Save behavior: Edit and save, check debug panel shows lastSavedVersionId and lastSavedAt
 * 4. Undo/Redo: Make three saves, use undo to restore previous versions
 * 5. Error cases: Lose lock mid-edit, try saving, confirm proper error message
 */

"use client";

import { useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface CollabDebugPanelProps {
  docId?: string | null;
  fileId?: string | null;
  projectId?: string | null;
  lockState?: {
    state: "UNLOCKED" | "LOCKED";
    locked_by?: string | null;
    canEdit?: boolean;
    expires_in?: number | null;
  } | null;
  lastSavedVersionId?: string | null;
  lastSavedAt?: Date | null;
  isCollaborative?: boolean;
  wsStatus?: 'connected' | 'disconnected' | 'syncing' | 'error';
  onReloadVersion?: (versionId: string) => void;
  isDark?: boolean;
}

export function CollabDebugPanel({
  docId,
  fileId,
  projectId,
  lockState,
  lastSavedVersionId,
  lastSavedAt,
  isCollaborative = false,
  wsStatus,
  onReloadVersion,
  isDark = false,
}: CollabDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isDev = process.env.NODE_ENV === 'development';

  // Only show in development
  if (!isDev) {
    return null;
  }

  const bgColor = isDark ? 'bg-[#1e1e1e] border-[#3e3e42]' : 'bg-gray-50 border-gray-200';
  const textColor = isDark ? 'text-[#cccccc]' : 'text-gray-700';
  const labelColor = isDark ? 'text-[#999999]' : 'text-gray-500';

  return (
    <div className={`border-t ${bgColor} ${textColor} text-xs`} data-testid="collab-debug-panel">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-3 py-2 flex items-center justify-between hover:bg-opacity-80 transition-colors ${bgColor}`}
        data-testid="collab-debug-toggle"
      >
        <span className="font-medium">🔧 Collaboration Debug</span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {isExpanded && (
        <div className={`px-3 py-2 space-y-2 ${bgColor}`}>
          {/* Doc ID */}
          <div className="flex items-start gap-2">
            <span className={labelColor}>Doc ID:</span>
            <span className="font-mono text-[10px] break-all" data-testid="collab-debug-doc-id">
              {docId || 'N/A'}
            </span>
          </div>

          {/* File ID */}
          <div className="flex items-start gap-2">
            <span className={labelColor}>File ID:</span>
            <span className="font-mono text-[10px] break-all">
              {fileId || 'N/A'}
            </span>
          </div>

          {/* Project ID */}
          <div className="flex items-start gap-2">
            <span className={labelColor}>Project ID:</span>
            <span className="font-mono text-[10px] break-all">
              {projectId || 'N/A'}
            </span>
          </div>

          {/* Lock Status */}
          <div className="flex items-center gap-2">
            <span className={labelColor}>Lock Status:</span>
            <span
              className={`font-medium ${
                lockState?.state === 'LOCKED' ? 'text-orange-500' : 'text-green-500'
              }`}
              data-testid="collab-debug-lock-status"
            >
              {lockState?.state || 'UNKNOWN'}
            </span>
          </div>

          {/* Locked By */}
          {lockState?.state === 'LOCKED' && lockState.locked_by && (
            <div className="flex items-center gap-2">
              <span className={labelColor}>Locked By:</span>
              <span className="font-mono text-[10px]">
                {lockState.locked_by.substring(0, 8)}...
              </span>
            </div>
          )}

          {/* Lock Expires In */}
          {lockState?.expires_in !== null && lockState?.expires_in !== undefined && (
            <div className="flex items-center gap-2">
              <span className={labelColor}>Expires In:</span>
              <span>{lockState.expires_in}s</span>
            </div>
          )}

          {/* Can Edit */}
          <div className="flex items-center gap-2">
            <span className={labelColor}>Can Edit:</span>
            <span className={lockState?.canEdit ? 'text-green-500' : 'text-red-500'}>
              {lockState?.canEdit ? 'true' : 'false'}
            </span>
          </div>

          {/* Last Saved Version */}
          <div className="flex items-start gap-2">
            <span className={labelColor}>Last Saved Version:</span>
            <span
              className="font-mono text-[10px] break-all"
              data-testid="collab-debug-last-version-id"
            >
              {lastSavedVersionId || 'N/A'}
            </span>
          </div>

          {/* Last Saved At */}
          {lastSavedAt && (
            <div className="flex items-center gap-2">
              <span className={labelColor}>Last Saved At:</span>
              <span className="text-[10px]">
                {lastSavedAt.toLocaleTimeString()}
              </span>
            </div>
          )}

          {/* Collaboration Status */}
          <div className="flex items-center gap-2">
            <span className={labelColor}>Collaboration:</span>
            <span className={isCollaborative ? 'text-green-500' : 'text-gray-500'}>
              {isCollaborative ? 'enabled' : 'disabled'}
            </span>
          </div>

          {/* WebSocket Status */}
          {wsStatus && (
            <div className="flex items-center gap-2">
              <span className={labelColor}>WebSocket:</span>
              <span
                className={
                  wsStatus === 'connected'
                    ? 'text-green-500'
                    : wsStatus === 'error'
                    ? 'text-red-500'
                    : 'text-yellow-500'
                }
              >
                {wsStatus}
              </span>
            </div>
          )}

          {/* Force Refresh Version Button */}
          {lastSavedVersionId && onReloadVersion && (
            <div className="pt-2 border-t border-gray-600">
              <button
                onClick={() => onReloadVersion(lastSavedVersionId)}
                className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] transition-colors ${
                  isDark
                    ? 'bg-[#2d2d30] hover:bg-[#3e3e42] text-[#cccccc]'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
                data-testid="collab-debug-reload-version"
              >
                <RefreshCw className="w-3 h-3" />
                Reload last saved version
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

