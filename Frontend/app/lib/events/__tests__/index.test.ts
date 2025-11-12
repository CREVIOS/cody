/**
 * Tests for index.ts exports
 *
 * This test file validates that all exports from index.ts work correctly.
 */

import {
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
  useEventBus,
  useEventPublisher,
  useEventOnce,
  useEventHistory,
  useSubscriberCount,
} from "../index";

describe("index.ts exports", () => {
  describe("EventBus exports", () => {
    it("should export EventBus class", () => {
      expect(EventBus).toBeDefined();
      expect(typeof EventBus).toBe("function");
      expect(EventBus.getInstance).toBeDefined();
    });

    it("should export eventBus singleton instance", () => {
      expect(eventBus).toBeDefined();
      expect(eventBus).toBeInstanceOf(EventBus);
    });

    it("should export EventType enum", () => {
      expect(EventType).toBeDefined();
      expect(EventType.FILE_UPDATED).toBe("file:updated");
      expect(EventType.FILE_CREATED).toBe("file:created");
      expect(EventType.USER_JOINED).toBe("user:joined");
    });
  });

  describe("Type exports", () => {
    it("should export EventPayload type", () => {
      // Type checking - if this compiles, the type is exported
      const event: EventPayload = {
        type: EventType.FILE_UPDATED,
        timestamp: Date.now(),
      };
      expect(event).toBeDefined();
    });

    it("should export BaseEvent type", () => {
      const baseEvent: BaseEvent = {
        type: EventType.FILE_UPDATED,
        timestamp: Date.now(),
      };
      expect(baseEvent).toBeDefined();
    });

    it("should export FileEvent type", () => {
      const fileEvent: FileEvent = {
        type: EventType.FILE_UPDATED,
        fileId: "123",
        fileName: "test.ts",
        projectId: "proj1",
        timestamp: Date.now(),
      };
      expect(fileEvent).toBeDefined();
    });

    it("should export UserPresenceEvent type", () => {
      const userEvent: UserPresenceEvent = {
        type: EventType.USER_JOINED,
        userId: "user1",
        userName: "Alice",
        timestamp: Date.now(),
      };
      expect(userEvent).toBeDefined();
    });

    it("should export LockEvent type", () => {
      const lockEvent: LockEvent = {
        type: EventType.FILE_LOCKED,
        fileId: "123",
        userId: "user1",
        timestamp: Date.now(),
      };
      expect(lockEvent).toBeDefined();
    });

    it("should export NotificationEvent type", () => {
      const notificationEvent: NotificationEvent = {
        type: EventType.NOTIFICATION_RECEIVED,
        notificationId: "notif1",
        message: "Test notification",
        userId: "user1",
        timestamp: Date.now(),
      };
      expect(notificationEvent).toBeDefined();
    });

    it("should export PermissionEvent type", () => {
      const permissionEvent: PermissionEvent = {
        type: EventType.PERMISSION_CHANGED,
        userId: "user1",
        projectId: "proj1",
        permission: "canEdit",
        granted: true,
        timestamp: Date.now(),
      };
      expect(permissionEvent).toBeDefined();
    });

    it("should export EventHandler type", () => {
      const handler: EventHandler<FileEvent> = (event) => {
        expect(event.type).toBe(EventType.FILE_UPDATED);
      };
      expect(handler).toBeDefined();
      expect(typeof handler).toBe("function");
    });
  });

  describe("Hook exports", () => {
    it("should export useEventBus hook", () => {
      expect(useEventBus).toBeDefined();
      expect(typeof useEventBus).toBe("function");
    });

    it("should export useEventPublisher hook", () => {
      expect(useEventPublisher).toBeDefined();
      expect(typeof useEventPublisher).toBe("function");
    });

    it("should export useEventOnce hook", () => {
      expect(useEventOnce).toBeDefined();
      expect(typeof useEventOnce).toBe("function");
    });

    it("should export useEventHistory hook", () => {
      expect(useEventHistory).toBeDefined();
      expect(typeof useEventHistory).toBe("function");
    });

    it("should export useSubscriberCount hook", () => {
      expect(useSubscriberCount).toBeDefined();
      expect(typeof useSubscriberCount).toBe("function");
    });
  });
});
