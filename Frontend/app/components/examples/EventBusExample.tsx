/**
 * Example Component Demonstrating Observer Pattern Usage
 *
 * This file shows how the Observer pattern (Event Bus) enables
 * loose coupling between components.
 *
 * BEFORE Observer Pattern:
 * - Components would need to directly call each other's methods
 * - Parent components would need to manage complex prop drilling
 * - Adding new listeners requires modifying existing code
 *
 * AFTER Observer Pattern:
 * - Components publish events without knowing who's listening
 * - Components subscribe to events they care about
 * - New listeners can be added without modifying publishers
 */

"use client";

import React, { useState } from "react";
import {
  EventType,
  useEventBus,
  useEventPublisher,
  type FileEvent,
  type UserPresenceEvent,
} from "@/lib/events";

/**
 * Component 1: File Action Component
 * This component publishes file events without knowing who's listening
 */
export function FileActions() {
  const publish = useEventPublisher();

  const handleFileUpdate = () => {
    // Publish event - we don't need to know who's listening!
    publish({
      type: EventType.FILE_UPDATED,
      fileId: "file-123",
      fileName: "example.tsx",
      projectId: "project-1",
      timestamp: Date.now(),
    } as FileEvent);
  };

  const handleFileCreate = () => {
    publish({
      type: EventType.FILE_CREATED,
      fileId: "file-456",
      fileName: "newfile.tsx",
      projectId: "project-1",
      timestamp: Date.now(),
    } as FileEvent);
  };

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">File Actions (Publisher)</h3>
      <div className="space-x-2">
        <button
          onClick={handleFileUpdate}
          className="px-3 py-1 bg-blue-500 text-white rounded"
        >
          Update File
        </button>
        <button
          onClick={handleFileCreate}
          className="px-3 py-1 bg-green-500 text-white rounded"
        >
          Create File
        </button>
      </div>
      <p className="text-sm text-gray-600 mt-2">
        This component publishes events without knowing who subscribes
      </p>
    </div>
  );
}

/**
 * Component 2: Activity Log Component
 * This component subscribes to file events and displays them
 */
export function ActivityLog() {
  const [activities, setActivities] = useState<string[]>([]);

  // Subscribe to ALL file events using Observer pattern
  useEventBus(EventType.FILE_UPDATED, (event: FileEvent) => {
    setActivities((prev) => [
      ...prev,
      `File updated: ${event.fileName} at ${new Date(
        event.timestamp
      ).toLocaleTimeString()}`,
    ]);
  });

  useEventBus(EventType.FILE_CREATED, (event: FileEvent) => {
    setActivities((prev) => [
      ...prev,
      `File created: ${event.fileName} at ${new Date(
        event.timestamp
      ).toLocaleTimeString()}`,
    ]);
  });

  useEventBus(EventType.FILE_DELETED, (event: FileEvent) => {
    setActivities((prev) => [
      ...prev,
      `File deleted: ${event.fileName} at ${new Date(
        event.timestamp
      ).toLocaleTimeString()}`,
    ]);
  });

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">Activity Log (Subscriber)</h3>
      <div className="max-h-40 overflow-y-auto">
        {activities.length === 0 ? (
          <p className="text-gray-500 text-sm">No activities yet</p>
        ) : (
          <ul className="space-y-1">
            {activities.map((activity, index) => (
              <li key={index} className="text-sm">
                {activity}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-sm text-gray-600 mt-2">
        This component listens to file events independently
      </p>
    </div>
  );
}

/**
 * Component 3: File Counter Component
 * Another independent subscriber - demonstrates loose coupling
 */
export function FileCounter() {
  const [fileCount, setFileCount] = useState(0);

  // This component also subscribes to file events
  // Note: FileActions component doesn't know this component exists!
  useEventBus(EventType.FILE_CREATED, () => {
    setFileCount((prev) => prev + 1);
  });

  useEventBus(EventType.FILE_DELETED, () => {
    setFileCount((prev) => Math.max(0, prev - 1));
  });

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">File Counter (Another Subscriber)</h3>
      <p className="text-2xl font-bold text-blue-600">{fileCount}</p>
      <p className="text-sm text-gray-600">Files created</p>
      <p className="text-sm text-gray-600 mt-2">
        This component also listens without the publisher knowing
      </p>
    </div>
  );
}

/**
 * Component 4: User Presence Indicator
 * Demonstrates subscribing to different event types
 */
export function UserPresenceIndicator() {
  const [users, setUsers] = useState<string[]>([]);
  const publish = useEventPublisher();

  useEventBus(EventType.USER_JOINED, (event: UserPresenceEvent) => {
    setUsers((prev) => [...prev, event.userName]);
  });

  useEventBus(EventType.USER_LEFT, (event: UserPresenceEvent) => {
    setUsers((prev) => prev.filter((name) => name !== event.userName));
  });

  const simulateUserJoin = () => {
    publish({
      type: EventType.USER_JOINED,
      userId: `user-${Date.now()}`,
      userName: `User ${users.length + 1}`,
      timestamp: Date.now(),
    } as UserPresenceEvent);
  };

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">User Presence</h3>
      <p className="text-sm">Active Users: {users.length}</p>
      <ul className="text-sm">
        {users.map((user, index) => (
          <li key={index}>{user}</li>
        ))}
      </ul>
      <button
        onClick={simulateUserJoin}
        className="mt-2 px-3 py-1 bg-purple-500 text-white rounded text-sm"
      >
        Simulate User Join
      </button>
    </div>
  );
}

/**
 * Main Demo Component
 */
export function EventBusDemo() {
  return (
    <div className="p-6 space-y-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">
          Observer Pattern Demo - Event Bus
        </h2>
        <p className="text-gray-600">
          Notice how components communicate without direct dependencies.
          FileActions doesn't know about ActivityLog or FileCounter, yet they
          all stay synchronized through events.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileActions />
        <ActivityLog />
        <FileCounter />
        <UserPresenceIndicator />
      </div>

      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
        <h4 className="font-bold mb-2">Benefits of Observer Pattern:</h4>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>
            <strong>Loose Coupling:</strong> Publishers don't know about
            subscribers
          </li>
          <li>
            <strong>Scalability:</strong> Easy to add new subscribers without
            changing publishers
          </li>
          <li>
            <strong>Maintainability:</strong> Event logic centralized in one
            place
          </li>
          <li>
            <strong>Flexibility:</strong> Subscribers can come and go
            dynamically
          </li>
        </ul>
      </div>
    </div>
  );
}

export default EventBusDemo;
