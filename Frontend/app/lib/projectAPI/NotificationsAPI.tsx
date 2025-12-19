import { BaseAPITemplate } from "./BaseAPITemplate";
import { InvitationNotification, Notification, PaginatedResponse } from "./TypeDefinitions";

export interface NotificationQueryOptions {
  is_read?: boolean;
  notification_type?: string;
  reference_id?: string;
  skip?: number;
  limit?: number;
}

/**
 * Fetch notifications for a user filtered to project invitations.
 */
export const getUserInvitationNotifications = async (
  userId: string,
  options: NotificationQueryOptions = {}
): Promise<InvitationNotification[]> => {
  class GetUserInvitationNotificationsCall extends BaseAPITemplate<InvitationNotification[]> {
    protected buildURL(): string {
      const params = new URLSearchParams({
        user_id: userId,
        notification_type: options.notification_type ?? "invitation",
        skip: String(options.skip ?? 0),
        limit: String(options.limit ?? 100),
      });

      if (options.is_read !== undefined) {
        params.append("is_read", String(options.is_read));
      }
      if (options.reference_id) {
        params.append("reference_id", options.reference_id);
      }

      return `${this.getBaseURL()}/api/v1/notifications/?${params.toString()}`;
    }

    protected buildOptions(): RequestInit {
      return { method: "GET" };
    }

    protected async parseResponse(response: Response): Promise<InvitationNotification[]> {
      const data: PaginatedResponse<InvitationNotification> = await response.json();
      return (data.items || []).map((notification) => ({
        ...notification,
        payload: notification.payload ?? {},
      }));
    }

    protected async onError(message: string): Promise<void> {
      console.error("Error fetching invitation notifications:", message);
    }
  }

  return new GetUserInvitationNotificationsCall().execute();
};

/**
 * Mark a notification as read.
 */
export const markNotificationRead = async (notificationId: string): Promise<Notification> => {
  class MarkNotificationReadCall extends BaseAPITemplate<Notification> {
    constructor(private notificationId: string) {
      super();
    }

    protected buildURL(): string {
      return `${this.getBaseURL()}/api/v1/notifications/${this.notificationId}/mark-read`;
    }

    protected buildOptions(): RequestInit {
      return {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      };
    }

    protected async parseResponse(response: Response): Promise<Notification> {
      const updated: Notification = await response.json();
      return {
        ...updated,
        payload: updated.payload ?? {},
      };
    }

    protected async onError(message: string): Promise<void> {
      console.error("Error marking notification read:", message);
    }
  }

  return new MarkNotificationReadCall(notificationId).execute();
};
