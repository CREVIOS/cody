/**
 * Observer Pattern Implementation - Event Bus
 *
 * This module implements the Observer (Publish-Subscribe) pattern to enable
 * loosely coupled communication between components.
 *
 * Design Pattern: Observer (Pub/Sub)
 * Purpose: Enable components to subscribe to and emit events without direct dependencies
 * Benefits:
 *   - Loose coupling: Publishers don't need to know about subscribers
 *   - Scalability: Easy to add new event types and subscribers
 *   - Maintainability: Event logic is centralized in one place
 *   - Testability: Easy to mock and test event flows
 */

/**
 * Event types that can be published through the event bus
 */
export enum EventType {
  // File events
  FILE_CREATED = "file:created",
  FILE_UPDATED = "file:updated",
  FILE_DELETED = "file:deleted",
  FILE_RENAMED = "file:renamed",

  // Directory events
  DIRECTORY_CREATED = "directory:created",
  DIRECTORY_DELETED = "directory:deleted",

  // User presence events
  USER_JOINED = "user:joined",
  USER_LEFT = "user:left",
  USER_ACTIVE = "user:active",
  USER_IDLE = "user:idle",

  // Lock events
  FILE_LOCKED = "file:locked",
  FILE_UNLOCKED = "file:unlocked",
  LOCK_ACQUIRED = "lock:acquired",
  LOCK_RELEASED = "lock:released",

  // Notification events
  NOTIFICATION_RECEIVED = "notification:received",
  NOTIFICATION_READ = "notification:read",

  // Permission events
  PERMISSION_CHANGED = "permission:changed",
  ROLE_UPDATED = "role:updated",

  // Project events
  PROJECT_UPDATED = "project:updated",
  PROJECT_MEMBER_ADDED = "project:member:added",
  PROJECT_MEMBER_REMOVED = "project:member:removed",
}

/**
 * Base interface for all events
 */
export interface BaseEvent {
  type: EventType;
  timestamp: number;
  source?: string;
}

/**
 * File-related event payload
 */
export interface FileEvent extends BaseEvent {
  fileId: string;
  fileName: string;
  projectId: string;
  userId?: string;
  content?: string;
}

/**
 * User presence event payload
 */
export interface UserPresenceEvent extends BaseEvent {
  userId: string;
  userName: string;
  projectId?: string;
  fileId?: string;
}

/**
 * Lock event payload
 */
export interface LockEvent extends BaseEvent {
  fileId: string;
  userId: string;
  lockId?: string;
}

/**
 * Notification event payload
 */
export interface NotificationEvent extends BaseEvent {
  notificationId: string;
  message: string;
  userId: string;
  priority?: "low" | "medium" | "high";
}

/**
 * Permission event payload
 */
export interface PermissionEvent extends BaseEvent {
  userId: string;
  projectId: string;
  permission: string;
  granted: boolean;
}

/**
 * Union type of all possible event payloads
 */
export type EventPayload =
  | FileEvent
  | UserPresenceEvent
  | LockEvent
  | NotificationEvent
  | PermissionEvent
  | BaseEvent;

/**
 * Event handler function type
 */
export type EventHandler<T extends EventPayload = EventPayload> = (
  event: T
) => void | Promise<void>;

/**
 * Subscription interface
 */
interface Subscription {
  id: string;
  eventType: EventType | "*"; // "*" means subscribe to all events
  handler: EventHandler;
  once: boolean; // If true, unsubscribe after first invocation
}

/**
 * EventBus - Observer Pattern Implementation
 *
 * This class acts as the Subject in the Observer pattern. It maintains a list
 * of observers (subscribers) and notifies them when events occur.
 */
export class EventBus {
  private subscriptions: Map<EventType | "*", Subscription[]> = new Map();
  private eventHistory: EventPayload[] = [];
  private maxHistorySize: number = 100;
  private static instance: EventBus | null = null;

  /**
   * Singleton pattern to ensure only one event bus exists
   */
  private constructor() {
    if (typeof window !== "undefined") {
      // Only in browser environment
      (window as any).__eventBus = this;
    }
  }

  /**
   * Get the singleton instance of EventBus
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to events of a specific type
   *
   * @param eventType - Type of event to subscribe to, or "*" for all events
   * @param handler - Function to call when event is published
   * @param options - Optional configuration
   * @returns Unsubscribe function
   *
   * @example
   * const unsubscribe = eventBus.subscribe(EventType.FILE_UPDATED, (event) => {
   *   console.log("File updated:", event.fileName);
   * });
   *
   * // Later, to unsubscribe:
   * unsubscribe();
   */
  public subscribe<T extends EventPayload = EventPayload>(
    eventType: EventType | "*",
    handler: EventHandler<T>,
    options: { once?: boolean } = {}
  ): () => void {
    const subscription: Subscription = {
      id: this.generateSubscriptionId(),
      eventType,
      handler: handler as EventHandler,
      once: options.once || false,
    };

    const subscribers = this.subscriptions.get(eventType) || [];
    subscribers.push(subscription);
    this.subscriptions.set(eventType, subscribers);

    // Return unsubscribe function
    return () => this.unsubscribe(subscription.id);
  }

  /**
   * Subscribe to an event only once
   *
   * @param eventType - Type of event to subscribe to
   * @param handler - Function to call when event is published
   * @returns Unsubscribe function
   */
  public once<T extends EventPayload = EventPayload>(
    eventType: EventType,
    handler: EventHandler<T>
  ): () => void {
    return this.subscribe(eventType, handler, { once: true });
  }

  /**
   * Unsubscribe from events
   *
   * @param subscriptionId - ID of the subscription to remove
   */
  public unsubscribe(subscriptionId: string): void {
    for (const [eventType, subscribers] of this.subscriptions.entries()) {
      const index = subscribers.findIndex((sub) => sub.id === subscriptionId);
      if (index !== -1) {
        subscribers.splice(index, 1);
        if (subscribers.length === 0) {
          this.subscriptions.delete(eventType);
        }
        break;
      }
    }
  }

  /**
   * Publish an event to all subscribers
   *
   * This is the notification mechanism of the Observer pattern.
   *
   * @param event - Event payload to publish
   *
   * @example
   * eventBus.publish({
   *   type: EventType.FILE_UPDATED,
   *   fileId: "123",
   *   fileName: "app.tsx",
   *   projectId: "proj-1",
   *   timestamp: Date.now()
   * });
   */
  public async publish(event: EventPayload): Promise<void> {
    // Add timestamp if not present
    if (!event.timestamp) {
      event.timestamp = Date.now();
    }

    // Store in history
    this.addToHistory(event);

    // Get specific subscribers for this event type
    const specificSubscribers = this.subscriptions.get(event.type) || [];

    // Get wildcard subscribers (subscribed to all events)
    const wildcardSubscribers = this.subscriptions.get("*") || [];

    // Combine both
    const allSubscribers = [...specificSubscribers, ...wildcardSubscribers];

    // Notify all subscribers
    const toRemove: string[] = [];

    for (const subscription of allSubscribers) {
      try {
        await subscription.handler(event);

        // Mark for removal if it's a one-time subscription
        if (subscription.once) {
          toRemove.push(subscription.id);
        }
      } catch (error) {
        console.error(`Error in event handler for ${event.type}:`, error);
      }
    }

    // Remove one-time subscriptions
    toRemove.forEach((id) => this.unsubscribe(id));
  }

  /**
   * Get event history
   *
   * @param eventType - Optional filter by event type
   * @param limit - Maximum number of events to return
   * @returns Array of past events
   */
  public getHistory(
    eventType?: EventType,
    limit?: number
  ): EventPayload[] {
    let history = this.eventHistory;

    if (eventType) {
      history = history.filter((e) => e.type === eventType);
    }

    if (limit) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * Clear all subscriptions
   */
  public clearAllSubscriptions(): void {
    this.subscriptions.clear();
  }

  /**
   * Clear event history
   */
  public clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get count of subscribers for an event type
   */
  public getSubscriberCount(eventType: EventType | "*"): number {
    return this.subscriptions.get(eventType)?.length || 0;
  }

  /**
   * Add event to history
   */
  private addToHistory(event: EventPayload): void {
    this.eventHistory.push(event);

    // Limit history size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Singleton instance of EventBus for global use
 */
export const eventBus = EventBus.getInstance();

/**
 * React hook for subscribing to events
 *
 * @example
 * import { useEventSubscription } from './EventBus';
 *
 * function MyComponent() {
 *   useEventSubscription(EventType.FILE_UPDATED, (event) => {
 *     console.log("File updated:", event.fileName);
 *   });
 *
 *   return <div>Component</div>;
 * }
 */
export function useEventSubscription<T extends EventPayload = EventPayload>(
  eventType: EventType | "*",
  handler: EventHandler<T>,
  dependencies: any[] = []
): void {
  if (typeof window === "undefined") return;

  // Using useEffect pattern for React hooks
  // This would be imported from React in actual usage
  const React = require("react");

  React.useEffect(() => {
    const unsubscribe = eventBus.subscribe(eventType, handler);
    return unsubscribe;
  }, [eventType, ...dependencies]);
}

export default EventBus;
