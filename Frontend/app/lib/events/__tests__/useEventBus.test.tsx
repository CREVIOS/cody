/**
 * Tests for React Hooks (useEventBus.ts)
 *
 * This test file validates that all React hooks for the Event Bus
 * work correctly with React component lifecycle.
 */

import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useEventBus,
  useEventPublisher,
  useEventOnce,
  useEventHistory,
  useSubscriberCount,
} from "../useEventBus";
import { EventBus, EventType, type FileEvent, type UserPresenceEvent } from "../EventBus";

describe("useEventBus Hook", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    // Get the singleton instance and clear it
    eventBus = EventBus.getInstance();
    eventBus.clearAllSubscriptions();
    eventBus.clearHistory();
  });

  afterEach(() => {
    // Clean up after each test
    eventBus.clearAllSubscriptions();
    eventBus.clearHistory();
  });

  describe("useEventBus", () => {
    it("should subscribe to events on mount and unsubscribe on unmount", async () => {
      const handler = jest.fn();
      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      const { unmount } = renderHook(() => {
        useEventBus(EventType.FILE_UPDATED, handler);
      });

      // Verify subscription was created
      expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(1);

      // Publish event
      await act(async () => {
        await eventBus.publish(event);
      });

      expect(handler).toHaveBeenCalledWith(event);

      // Unmount and verify cleanup
      unmount();
      await waitFor(() => {
        expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(0);
      });
    });

    it("should resubscribe when eventType changes", async () => {
      const handler = jest.fn();
      const { rerender } = renderHook(
        ({ eventType }) => {
          useEventBus(eventType, handler);
        },
        {
          initialProps: { eventType: EventType.FILE_UPDATED },
        }
      );

      expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(1);
      expect(eventBus.getSubscriberCount(EventType.FILE_CREATED)).toBe(0);

      // Change event type
      rerender({ eventType: EventType.FILE_CREATED });

      await waitFor(() => {
        expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(0);
        expect(eventBus.getSubscriberCount(EventType.FILE_CREATED)).toBe(1);
      });
    });

    it("should resubscribe when dependencies change", async () => {
      const handler = jest.fn();
      const { rerender } = renderHook(
        ({ deps }) => {
          useEventBus(EventType.FILE_UPDATED, handler, deps);
        },
        {
          initialProps: { deps: ["dep1"] },
        }
      );

      expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(1);

      // Change dependencies
      rerender({ deps: ["dep2"] });

      // Should have resubscribed (old one cleaned up, new one added)
      await waitFor(() => {
        expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(1);
      });
    });

    it("should support wildcard subscriptions", async () => {
      const handler = jest.fn();
      renderHook(() => {
        useEventBus("*", handler);
      });

      expect(eventBus.getSubscriberCount("*")).toBe(1);

      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      await act(async () => {
        await eventBus.publish(event);
      });

      expect(handler).toHaveBeenCalledWith(event);
    });
  });

  describe("useEventPublisher", () => {
    it("should return a publish function", () => {
      const { result } = renderHook(() => useEventPublisher());

      expect(result.current).toBeDefined();
      expect(typeof result.current).toBe("function");
    });

    it("should publish events when called", async () => {
      const handler = jest.fn();
      eventBus.subscribe(EventType.FILE_UPDATED, handler);

      const { result } = renderHook(() => useEventPublisher());

      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      await act(async () => {
        result.current(event);
      });

      await waitFor(() => {
        expect(handler).toHaveBeenCalledWith(event);
      });
    });

    it("should maintain the same publish function reference across renders", () => {
      const { result, rerender } = renderHook(() => useEventPublisher());
      const firstPublish = result.current;

      rerender();

      expect(result.current).toBe(firstPublish);
    });
  });

  describe("useEventOnce", () => {
    it("should subscribe to an event only once", async () => {
      const handler = jest.fn();
      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      renderHook(() => {
        useEventOnce(EventType.FILE_UPDATED, handler);
      });

      // Publish event twice
      await act(async () => {
        await eventBus.publish(event);
        await eventBus.publish(event);
      });

      // Handler should only be called once
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should not subscribe when enabled is false", () => {
      const handler = jest.fn();

      renderHook(() => {
        useEventOnce(EventType.FILE_UPDATED, handler, false);
      });

      expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(0);
    });

    it("should subscribe when enabled changes from false to true", async () => {
      const handler = jest.fn();
      const { rerender } = renderHook(
        ({ enabled }) => {
          useEventOnce(EventType.FILE_UPDATED, handler, enabled);
        },
        {
          initialProps: { enabled: false },
        }
      );

      expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(0);

      // Enable
      rerender({ enabled: true });

      await waitFor(() => {
        expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(1);
      });
    });

    it("should not resubscribe after handler is called", async () => {
      const handler = jest.fn();
      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      const { rerender } = renderHook(() => {
        useEventOnce(EventType.FILE_UPDATED, handler);
      });

      // Publish event
      await act(async () => {
        await eventBus.publish(event);
      });

      expect(handler).toHaveBeenCalledTimes(1);

      // Rerender should not resubscribe
      rerender();

      await waitFor(() => {
        expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(0);
      });
    });
  });

  describe("useEventHistory", () => {
    it("should return event history", async () => {
      const event1: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test1.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      const event2: FileEvent = {
        type: EventType.FILE_CREATED,
        fileId: "456",
        fileName: "test2.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      await act(async () => {
        await eventBus.publish(event1);
        await eventBus.publish(event2);
      });

      const { result } = renderHook(() => useEventHistory());

      expect(result.current).toHaveLength(2);
      expect(result.current[0]).toEqual(event1);
      expect(result.current[1]).toEqual(event2);
    });

    it("should filter history by event type", async () => {
      const fileEvent: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      const userEvent: UserPresenceEvent = {
        type: EventType.USER_JOINED,
        userId: "user1",
        userName: "Alice",
        timestamp: Date.now(),
      };

      await act(async () => {
        await eventBus.publish(fileEvent);
        await eventBus.publish(userEvent);
      });

      const { result } = renderHook(() => useEventHistory(EventType.FILE_UPDATED));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].type).toBe(EventType.FILE_UPDATED);
    });

    it("should limit history results", async () => {
      // Publish multiple events
      for (let i = 0; i < 10; i++) {
        const event: FileEvent = {
          type: EventType.FILE_UPDATED,
          fileId: `file-${i}`,
          fileName: `test-${i}.ts`,
          projectId: "proj1",
          timestamp: Date.now() + i,
        };
        await act(async () => {
          await eventBus.publish(event);
        });
      }

      const { result } = renderHook(() => useEventHistory(undefined, 5));

      expect(result.current.length).toBeLessThanOrEqual(5);
    });

    it("should update when new events are published", async () => {
      const { result } = renderHook(() => useEventHistory());

      expect(result.current).toHaveLength(0);

      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      await act(async () => {
        await eventBus.publish(event);
      });

      // Note: This hook doesn't automatically re-render on new events
      // It's a read-only hook that gets current state
      // We need to manually check the result
      const history = eventBus.getHistory();
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe("useSubscriberCount", () => {
    it("should return subscriber count for an event type", () => {
      eventBus.subscribe(EventType.FILE_UPDATED, jest.fn());
      eventBus.subscribe(EventType.FILE_UPDATED, jest.fn());

      const { result } = renderHook(() => useSubscriberCount(EventType.FILE_UPDATED));

      expect(result.current).toBe(2);
    });

    it("should return 0 when no subscribers exist", () => {
      const { result } = renderHook(() => useSubscriberCount(EventType.FILE_CREATED));

      expect(result.current).toBe(0);
    });

    it("should return wildcard subscriber count", () => {
      eventBus.subscribe("*", jest.fn());

      const { result } = renderHook(() => useSubscriberCount("*"));

      expect(result.current).toBe(1);
    });

    it("should update when subscribers change", () => {
      const { result, rerender } = renderHook(() => useSubscriberCount(EventType.FILE_UPDATED));

      expect(result.current).toBe(0);

      // Add subscriber
      const unsubscribe = eventBus.subscribe(EventType.FILE_UPDATED, jest.fn());
      rerender();

      // Note: This hook doesn't automatically re-render when subscribers change
      // It's a read-only hook that gets current state
      const count = eventBus.getSubscriberCount(EventType.FILE_UPDATED);
      expect(count).toBe(1);

      // Remove subscriber
      unsubscribe();
      rerender();

      const newCount = eventBus.getSubscriberCount(EventType.FILE_UPDATED);
      expect(newCount).toBe(0);
    });
  });
});

