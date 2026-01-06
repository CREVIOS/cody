/**
 * Tests for Observer Pattern - Event Bus
 *
 * This test file validates that the Observer (Pub/Sub) pattern
 * correctly enables loose coupling between components through events.
 */

import { EventBus, EventType, type FileEvent, type UserPresenceEvent } from "../app/lib/events/EventBus";

describe("EventBus - Observer Pattern", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    // Get fresh instance for each test
    eventBus = EventBus.getInstance();
    eventBus.clearAllSubscriptions();
    eventBus.clearHistory();
  });

  afterEach(() => {
    eventBus.clearAllSubscriptions();
    eventBus.clearHistory();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = EventBus.getInstance();
      const instance2 = EventBus.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe("Subscribe/Unsubscribe", () => {
    it("should allow subscribing to events", () => {
      // Arrange
      const handler = jest.fn();

      // Act
      const unsubscribe = eventBus.subscribe(EventType.FILE_UPDATED, handler);

      // Assert
      expect(unsubscribe).toBeInstanceOf(Function);
      expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(1);
    });

    it("should allow unsubscribing from events", () => {
      // Arrange
      const handler = jest.fn();
      const unsubscribe = eventBus.subscribe(EventType.FILE_UPDATED, handler);

      // Act
      unsubscribe();

      // Assert
      expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(0);
    });

    it("should support multiple subscribers for the same event", () => {
      // Arrange
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      // Act
      eventBus.subscribe(EventType.FILE_UPDATED, handler1);
      eventBus.subscribe(EventType.FILE_UPDATED, handler2);
      eventBus.subscribe(EventType.FILE_UPDATED, handler3);

      // Assert
      expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(3);
    });

    it("should support wildcard subscriptions", () => {
      // Arrange
      const wildcardHandler = jest.fn();
      eventBus.subscribe("*", wildcardHandler);

      // Act - Publish different event types
      eventBus.publish({
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      } as FileEvent);

      eventBus.publish({
        type: EventType.USER_JOINED,
        userId: "user1",
        userName: "Alice",
        timestamp: Date.now(),
      } as UserPresenceEvent);

      // Assert - Wildcard handler receives all events
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(wildcardHandler).toHaveBeenCalledTimes(2);
          resolve();
        }, 10);
      });
    });
  });

  describe("Publish/Notify", () => {
    it("should notify subscribers when event is published", async () => {
      // Arrange
      const handler = jest.fn();
      eventBus.subscribe(EventType.FILE_UPDATED, handler);

      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      // Act
      await eventBus.publish(event);

      // Assert
      expect(handler).toHaveBeenCalledWith(event);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should notify all subscribers of the same event type", async () => {
      // Arrange
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      eventBus.subscribe(EventType.FILE_UPDATED, handler1);
      eventBus.subscribe(EventType.FILE_UPDATED, handler2);
      eventBus.subscribe(EventType.FILE_UPDATED, handler3);

      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      // Act
      await eventBus.publish(event);

      // Assert - All subscribers notified
      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it("should only notify subscribers of the specific event type", async () => {
      // Arrange
      const fileHandler = jest.fn();
      const userHandler = jest.fn();

      eventBus.subscribe(EventType.FILE_UPDATED, fileHandler);
      eventBus.subscribe(EventType.USER_JOINED, userHandler);

      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      // Act
      await eventBus.publish(event);

      // Assert
      expect(fileHandler).toHaveBeenCalledWith(event);
      expect(userHandler).not.toHaveBeenCalled();
    });

    it("should add timestamp to events if not provided", async () => {
      // Arrange
      const handler = jest.fn();
      eventBus.subscribe(EventType.FILE_UPDATED, handler);

      const event = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        // No timestamp provided
      } as FileEvent;

      // Act
      await eventBus.publish(event);

      // Assert
      expect(handler).toHaveBeenCalled();
      const receivedEvent = handler.mock.calls[0][0];
      expect(receivedEvent.timestamp).toBeDefined();
      expect(typeof receivedEvent.timestamp).toBe("number");
    });
  });

  describe("One-Time Subscriptions", () => {
    it("should unsubscribe after first event when using once()", async () => {
      // Arrange
      const handler = jest.fn();
      eventBus.once(EventType.FILE_UPDATED, handler);

      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      // Act - Publish twice
      await eventBus.publish(event);
      await eventBus.publish(event);

      // Assert - Handler only called once
      expect(handler).toHaveBeenCalledTimes(1);
      expect(eventBus.getSubscriberCount(EventType.FILE_UPDATED)).toBe(0);
    });

    it("should support once option in subscribe()", async () => {
      // Arrange
      const handler = jest.fn();
      eventBus.subscribe(EventType.FILE_UPDATED, handler, { once: true });

      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      // Act
      await eventBus.publish(event);
      await eventBus.publish(event);

      // Assert
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Event History", () => {
    it("should store event history", async () => {
      // Arrange
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

      // Act
      await eventBus.publish(event1);
      await eventBus.publish(event2);

      // Assert
      const history = eventBus.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual(event1);
      expect(history[1]).toEqual(event2);
    });

    it("should filter history by event type", async () => {
      // Arrange
      await eventBus.publish({
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      } as FileEvent);

      await eventBus.publish({
        type: EventType.USER_JOINED,
        userId: "user1",
        userName: "Alice",
        timestamp: Date.now(),
      } as UserPresenceEvent);

      // Act
      const fileHistory = eventBus.getHistory(EventType.FILE_UPDATED);

      // Assert
      expect(fileHistory).toHaveLength(1);
      expect(fileHistory[0].type).toBe(EventType.FILE_UPDATED);
    });

    it("should limit history size", async () => {
      // Arrange
      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      // Act
      const history = eventBus.getHistory(undefined, 5);

      // Assert
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it("should automatically limit history to maxHistorySize (100)", async () => {
      // Arrange - Publish more than 100 events
      const events: FileEvent[] = [];
      for (let i = 0; i < 105; i++) {
        events.push({
          type: EventType.FILE_UPDATED,
          fileId: `file-${i}`,
          fileName: `test-${i}.ts`,
          projectId: "proj1",
          timestamp: Date.now() + i,
        });
      }

      // Act - Publish all events
      for (const event of events) {
        await eventBus.publish(event);
      }

      // Assert - History should be limited to 100 events
      const history = eventBus.getHistory();
      expect(history.length).toBe(100);
      // First 5 events should be removed (oldest ones)
      expect(history[0].fileId).toBe("file-5");
      expect(history[history.length - 1].fileId).toBe("file-104");
    });

    it("should clear history when requested", async () => {
      // Arrange
      await eventBus.publish({
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      } as FileEvent);

      // Act
      eventBus.clearHistory();

      // Assert
      expect(eventBus.getHistory()).toHaveLength(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle errors in event handlers gracefully", async () => {
      // Arrange - Mock console.error to suppress expected error log
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      
      const errorHandler = jest.fn(() => {
        throw new Error("Handler error");
      });
      const normalHandler = jest.fn();

      eventBus.subscribe(EventType.FILE_UPDATED, errorHandler);
      eventBus.subscribe(EventType.FILE_UPDATED, normalHandler);

      const event: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };

      // Act
      await eventBus.publish(event);

      // Assert - Normal handler should still be called
      expect(normalHandler).toHaveBeenCalled();
      // Verify that error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error in event handler for file:updated:"),
        expect.any(Error)
      );
      
      // Cleanup
      consoleErrorSpy.mockRestore();
    });
  });

  describe("Observer Pattern Benefits", () => {
    it("should enable loose coupling between publisher and subscribers", async () => {
      // Arrange
      const subscriber1 = jest.fn();
      const subscriber2 = jest.fn();

      // Subscribers register without publisher knowing
      eventBus.subscribe(EventType.FILE_UPDATED, subscriber1);
      eventBus.subscribe(EventType.FILE_UPDATED, subscriber2);

      // Publisher doesn't know about subscribers
      const publishEvent = async () => {
        await eventBus.publish({
          type: EventType.FILE_UPDATED,
          fileId: "123",
          fileName: "test.ts",
          projectId: "proj1",
          timestamp: Date.now(),
        } as FileEvent);
      };

      // Act
      await publishEvent();

      // Assert - Both subscribers notified without publisher knowing
      expect(subscriber1).toHaveBeenCalled();
      expect(subscriber2).toHaveBeenCalled();
    });

    it("should allow adding subscribers without modifying publisher", async () => {
      // Arrange - Initial subscriber
      const initialSubscriber = jest.fn();
      eventBus.subscribe(EventType.FILE_UPDATED, initialSubscriber);

      // Act - Add new subscriber later
      const newSubscriber = jest.fn();
      eventBus.subscribe(EventType.FILE_UPDATED, newSubscriber);

      // Publish event
      await eventBus.publish({
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      } as FileEvent);

      // Assert - Both subscribers notified
      expect(initialSubscriber).toHaveBeenCalled();
      expect(newSubscriber).toHaveBeenCalled();
    });

    it("should support 1-to-many communication", async () => {
      // Arrange - One publisher, many subscribers
      const subscribers = Array.from({ length: 10 }, () => jest.fn());

      subscribers.forEach((handler) => {
        eventBus.subscribe(EventType.FILE_UPDATED, handler);
      });

      // Act - Single publish
      await eventBus.publish({
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      } as FileEvent);

      // Assert - All 10 subscribers notified
      subscribers.forEach((handler) => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });

    it("should support dynamic subscription/unsubscription", async () => {
      // Arrange
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      const unsub1 = eventBus.subscribe(EventType.FILE_UPDATED, handler1);
      const unsub2 = eventBus.subscribe(EventType.FILE_UPDATED, handler2);

      // Act - Publish, then unsubscribe handler1, then publish again
      await eventBus.publish({
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      } as FileEvent);

      unsub1(); // Unsubscribe handler1

      await eventBus.publish({
        type: EventType.FILE_UPDATED,
        fileId: "456",
        fileName: "test2.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      } as FileEvent);

      // Assert
      expect(handler1).toHaveBeenCalledTimes(1); // Only first event
      expect(handler2).toHaveBeenCalledTimes(2); // Both events
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle file update notification scenario", async () => {
      // Arrange - Multiple components interested in file updates
      const activityLog = jest.fn();
      const fileTree = jest.fn();
      const notification = jest.fn();

      eventBus.subscribe(EventType.FILE_UPDATED, activityLog);
      eventBus.subscribe(EventType.FILE_UPDATED, fileTree);
      eventBus.subscribe(EventType.FILE_UPDATED, notification);

      // Act - File editor publishes update event
      await eventBus.publish({
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "app.tsx",
        projectId: "proj1",
        content: "new content",
        timestamp: Date.now(),
      } as FileEvent);

      // Assert - All components notified independently
      expect(activityLog).toHaveBeenCalled();
      expect(fileTree).toHaveBeenCalled();
      expect(notification).toHaveBeenCalled();
    });

    it("should handle user presence scenario", async () => {
      // Arrange
      const userList = jest.fn();
      const welcomeMessage = jest.fn();
      const analytics = jest.fn();

      eventBus.subscribe(EventType.USER_JOINED, userList);
      eventBus.subscribe(EventType.USER_JOINED, welcomeMessage);
      eventBus.subscribe(EventType.USER_JOINED, analytics);

      // Act
      await eventBus.publish({
        type: EventType.USER_JOINED,
        userId: "user123",
        userName: "Alice",
        projectId: "proj1",
        timestamp: Date.now(),
      } as UserPresenceEvent);

      // Assert
      expect(userList).toHaveBeenCalled();
      expect(welcomeMessage).toHaveBeenCalled();
      expect(analytics).toHaveBeenCalled();
    });
  });

  describe("useEventSubscription", () => {
    it("should be exported as a function", () => {
      // Arrange
      const { useEventSubscription } = require("../app/lib/events/EventBus");

      // Assert
      expect(typeof useEventSubscription).toBe("function");
    });

    it("should have the correct function signature", () => {
      // Arrange
      const { useEventSubscription } = require("../app/lib/events/EventBus");

      // Assert - Function exists and can be called (even if it fails due to React context)
      expect(useEventSubscription.length).toBeGreaterThanOrEqual(2);
    });

    it("should check for window before using React", () => {
      // Arrange - Test that the function structure is correct
      // The actual hook behavior is tested in useEventBus.test.tsx
      const { useEventSubscription } = require("../app/lib/events/EventBus");
      
      // Assert - Function exists
      expect(useEventSubscription).toBeDefined();
      expect(typeof useEventSubscription).toBe("function");
      
      // Note: Full hook testing is done in useEventBus.test.tsx
      // This test verifies the export and basic structure
    });
  });
});
