'use client';

import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import { ConnectionStatus } from '../../lib/collaboration/WebSocketProvider';

/**
 * Collaborative User List
 *
 * Displays all connected users with:
 * - User avatars with colors
 * - Active/typing indicators
 * - Connection status
 * - User count
 */

interface User {
  id: string;
  name: string;
  color: string;
  isTyping: boolean;
  lastActivity: number;
}

interface CollaborativeUserListProps {
  awareness: Awareness | null;
  connectionStatus: ConnectionStatus;
  currentUserId?: string;
  className?: string;
}

export function CollaborativeUserList({
  awareness,
  connectionStatus,
  currentUserId,
  className = '',
}: CollaborativeUserListProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [lastCursorUpdate, setLastCursorUpdate] = useState<Map<string, number>>(new Map());

  /**
   * Update users from awareness
   */
  useEffect(() => {
    if (!awareness) return;

    const updateUsers = () => {
      const states = awareness.getStates();
      const newUsers: User[] = [];
      const now = Date.now();

      states.forEach((state, clientId) => {
        if (!state.user) return;

        const userId = state.user.id;
        const lastUpdate = lastCursorUpdate.get(userId) || 0;
        const isTyping = state.cursor && now - lastUpdate < 2000; // Typing if cursor moved in last 2s

        newUsers.push({
          id: userId,
          name: state.user.name,
          color: state.user.color,
          isTyping,
          lastActivity: state.cursor?.timestamp || 0,
        });

        // Track cursor updates for typing indicator
        if (state.cursor) {
          setLastCursorUpdate((prev) => new Map(prev).set(userId, now));
        }
      });

      // Sort by name
      newUsers.sort((a, b) => a.name.localeCompare(b.name));

      setUsers(newUsers);
    };

    awareness.on('change', updateUsers);
    updateUsers();

    // Update typing status periodically
    const interval = setInterval(updateUsers, 1000);

    return () => {
      awareness.off('change', updateUsers);
      clearInterval(interval);
    };
  }, [awareness, lastCursorUpdate]);

  /**
   * Get connection status display
   */
  const getStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          text: 'Connected',
          color: 'text-green-500',
          dot: 'bg-green-500',
        };
      case 'connecting':
        return {
          text: 'Connecting...',
          color: 'text-yellow-500',
          dot: 'bg-yellow-500',
        };
      case 'reconnecting':
        return {
          text: 'Reconnecting...',
          color: 'text-orange-500',
          dot: 'bg-orange-500 animate-pulse',
        };
      case 'disconnected':
        return {
          text: 'Disconnected',
          color: 'text-red-500',
          dot: 'bg-red-500',
        };
    }
  };

  const status = getStatusDisplay();

  return (
    <div className={`collaborative-user-list ${className}`}>
      {/* Connection Status */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className={`w-2 h-2 rounded-full ${status.dot}`} />
        <span className={`text-xs font-medium ${status.color}`}>{status.text}</span>
        <span className="text-xs text-gray-500 ml-auto">
          {users.length} {users.length === 1 ? 'user' : 'users'}
        </span>
      </div>

      {/* User List */}
      <div className="overflow-y-auto max-h-64">
        {users.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-500">
            No other users connected
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {/* User Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {user.name}
                      {user.id === currentUserId && (
                        <span className="ml-1 text-xs text-gray-500">(you)</span>
                      )}
                    </p>
                  </div>

                  {/* Typing Indicator */}
                  {user.isTyping && user.id !== currentUserId && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="flex gap-0.5">
                        <span
                          className="w-1 h-1 rounded-full animate-bounce"
                          style={{ backgroundColor: user.color, animationDelay: '0ms' }}
                        />
                        <span
                          className="w-1 h-1 rounded-full animate-bounce"
                          style={{ backgroundColor: user.color, animationDelay: '150ms' }}
                        />
                        <span
                          className="w-1 h-1 rounded-full animate-bounce"
                          style={{ backgroundColor: user.color, animationDelay: '300ms' }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 ml-1">typing...</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Compact user avatar list (for toolbar)
 */
export function CollaborativeUserAvatars({
  awareness,
  connectionStatus,
  currentUserId,
  maxVisible = 5,
  className = '',
}: CollaborativeUserListProps & { maxVisible?: number }) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!awareness) return;

    const updateUsers = () => {
      const states = awareness.getStates();
      const newUsers: User[] = [];

      states.forEach((state) => {
        if (state.user) {
          newUsers.push({
            id: state.user.id,
            name: state.user.name,
            color: state.user.color,
            isTyping: false,
            lastActivity: 0,
          });
        }
      });

      setUsers(newUsers);
    };

    awareness.on('change', updateUsers);
    updateUsers();

    return () => {
      awareness.off('change', updateUsers);
    };
  }, [awareness]);

  const visibleUsers = users.slice(0, maxVisible);
  const hiddenCount = users.length - visibleUsers.length;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Connection indicator */}
      <div
        className={`w-2 h-2 rounded-full ${
          connectionStatus === 'connected'
            ? 'bg-green-500'
            : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
            ? 'bg-yellow-500 animate-pulse'
            : 'bg-red-500'
        }`}
        title={connectionStatus}
      />

      {/* User avatars */}
      <div className="flex -space-x-2">
        {visibleUsers.map((user) => (
          <div
            key={user.id}
            className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center text-white text-xs font-semibold"
            style={{ backgroundColor: user.color }}
            title={user.name}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
        ))}

        {hiddenCount > 0 && (
          <div
            className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center text-xs font-semibold bg-gray-400 text-white"
            title={`${hiddenCount} more user${hiddenCount > 1 ? 's' : ''}`}
          >
            +{hiddenCount}
          </div>
        )}
      </div>

      {users.length > 0 && (
        <span className="text-xs text-gray-500 ml-1">{users.length}</span>
      )}
    </div>
  );
}
