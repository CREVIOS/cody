/**
 * Event System Exports
 *
 * This module provides a centralized event system using the Observer pattern.
 */

export {
  EventBus,
  eventBus,
  EventType,
  type EventPayload,
  type BaseEvent,
  type FileEvent,
  type UserPresenceEvent,
  type LockEvent,
  type NotificationEvent,
  type PermissionEvent,
  type EventHandler,
} from "./EventBus";

export {
  useEventBus,
  useEventPublisher,
  useEventOnce,
  useEventHistory,
  useSubscriberCount,
} from "./useEventBus";
