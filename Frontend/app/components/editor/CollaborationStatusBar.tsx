/**
 * Collaboration Status Bar Component
 *
 * Displays both lock status and CRDT collaboration status in a unified UI.
 * This addresses the integration gap identified in the analysis.
 *
 * Shows:
 * - Lock holder (who has exclusive edit permission)
 * - Active collaborators (who's editing via CRDT)
 * - Warning if lock is held by someone else but CRDT is active
 */

"use client";

import React from 'react';
import { LockState } from '@/api/locksClient';

interface CollaborationStatusBarProps {
  // Lock state
  lockState: LockState | null;
  currentUserId: string;

  // CRDT collaboration state
  activeCollaborators?: Array<{
    id: string;
    name: string;
    color: string;
  }>;

  // File info
  fileName?: string;
}

export function CollaborationStatusBar({
  lockState,
  currentUserId,
  activeCollaborators = [],
  fileName = 'Untitled'
}: CollaborationStatusBarProps) {
  // Determine lock status
  const isLocked = lockState?.state === 'LOCKED';
  const lockHolder = isLocked ? lockState.holder_user_id : null;
  const iHoldLock = lockHolder === currentUserId;
  const someoneElseHoldsLock = isLocked && !iHoldLock;

  // CRDT collaboration status
  const collaboratorCount = activeCollaborators.length;
  const hasActiveCollaborators = collaboratorCount > 0;

  // Warning condition: someone holds lock but CRDT shows active collaborators
  const hasConflict = someoneElseHoldsLock && hasActiveCollaborators;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-sm">
      {/* Left side: File name */}
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {fileName}
        </span>
      </div>

      {/* Right side: Collaboration status */}
      <div className="flex items-center gap-4">
        {/* Lock Status */}
        {isLocked && (
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
            iHoldLock
              ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
              : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
          }`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-medium">
              {iHoldLock ? 'You have edit control' : `Locked by ${lockHolder}`}
            </span>
          </div>
        )}

        {/* CRDT Collaboration Status */}
        {hasActiveCollaborators && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
            <span className="text-xs font-medium">
              {collaboratorCount} editing
            </span>
            {/* Avatar stack */}
            <div className="flex -space-x-2">
              {activeCollaborators.slice(0, 3).map((collab) => (
                <div
                  key={collab.id}
                  className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: collab.color }}
                  title={collab.name}
                >
                  {collab.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {collaboratorCount > 3 && (
                <div className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 bg-gray-400 flex items-center justify-center text-xs font-bold text-white">
                  +{collaboratorCount - 3}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Warning: Conflict between lock and CRDT */}
        {hasConflict && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-medium">
              Changes will merge automatically
            </span>
          </div>
        )}

        {/* No activity */}
        {!isLocked && !hasActiveCollaborators && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            <span className="text-xs font-medium">
              No active collaborators
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default CollaborationStatusBar;
