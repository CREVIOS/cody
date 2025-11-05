/**
 * React Hooks for Event Bus (Observer Pattern)
 *
 * This module provides React hooks to integrate the Observer pattern
 * with React component lifecycle.
 */

"use client";

import { useEffect, useCallback, useRef } from "react";
import { EventBus, EventType, EventPayload, EventHandler } from "./EventBus";

/**
 * Hook to subscribe to events with automatic cleanup
 *
 * @param eventType - Type of event to subscribe to
 * @param handler - Event handler function
 * @param dependencies - Dependencies array (like useEffect)
 *
 * @example
 * function FileEditor() {
 *   useEventBus(EventType.FILE_UPDATED, (event) => {
 *     console.log("File updated:", event.fileName);
 *     // Update UI accordingly
 *   });
 *
 *   return <div>Editor</div>;
 * }
 */
export function useEventBus<T extends EventPayload = EventPayload>(
  eventType: EventType | "*",
  handler: EventHandler<T>,
  dependencies: any[] = []
): void {
  const eventBus = EventBus.getInstance();

  useEffect(() => {
    const unsubscribe = eventBus.subscribe(eventType, handler);

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, ...dependencies]);
}

/**
 * Hook to get a publish function for emitting events
 *
 * @returns publish function
 *
 * @example
 * function FileUploader() {
 *   const publish = useEventPublisher();
 *
 *   const handleUpload = (file) => {
 *     // Upload file...
 *     publish({
 *       type: EventType.FILE_CREATED,
 *       fileId: file.id,
 *       fileName: file.name,
 *       projectId: currentProject,
 *       timestamp: Date.now()
 *     });
 *   };
 *
 *   return <button onClick={handleUpload}>Upload</button>;
 * }
 */
export function useEventPublisher() {
  const eventBus = EventBus.getInstance();

  return useCallback(
    (event: EventPayload) => {
      eventBus.publish(event);
    },
    [eventBus]
  );
}

/**
 * Hook to listen to an event only once
 *
 * @param eventType - Type of event to subscribe to
 * @param handler - Event handler function
 * @param enabled - Whether the listener is enabled
 *
 * @example
 * function WelcomeMessage() {
 *   useEventOnce(EventType.USER_JOINED, (event) => {
 *     showNotification(`Welcome ${event.userName}!`);
 *   });
 *
 *   return <div>Dashboard</div>;
 * }
 */
export function useEventOnce<T extends EventPayload = EventPayload>(
  eventType: EventType,
  handler: EventHandler<T>,
  enabled: boolean = true
): void {
  const eventBus = EventBus.getInstance();
  const hasBeenCalled = useRef(false);

  useEffect(() => {
    if (!enabled || hasBeenCalled.current) return;

    const unsubscribe = eventBus.once(eventType, (event) => {
      hasBeenCalled.current = true;
      handler(event as T);
    });

    return () => {
      unsubscribe();
    };
  }, [eventBus, eventType, enabled]);
}

/**
 * Hook to get event history
 *
 * @param eventType - Optional filter by event type
 * @param limit - Maximum number of events to return
 * @returns Array of past events
 *
 * @example
 * function EventLog() {
 *   const fileEvents = useEventHistory(EventType.FILE_UPDATED, 10);
 *
 *   return (
 *     <ul>
 *       {fileEvents.map(event => (
 *         <li key={event.timestamp}>{event.fileName} updated</li>
 *       ))}
 *     </ul>
 *   );
 * }
 */
export function useEventHistory(
  eventType?: EventType,
  limit?: number
): EventPayload[] {
  const eventBus = EventBus.getInstance();
  return eventBus.getHistory(eventType, limit);
}

/**
 * Hook to get subscriber count for debugging
 *
 * @param eventType - Event type to check
 * @returns Number of subscribers
 */
export function useSubscriberCount(eventType: EventType | "*"): number {
  const eventBus = EventBus.getInstance();
  return eventBus.getSubscriberCount(eventType);
}
