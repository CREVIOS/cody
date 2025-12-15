import { API_BASE_URL } from "./APIConfiguration";
import { getErrorMessage } from "./ErrorHandling";
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

  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/?${params.toString()}`);
  if (!response.ok) {
    const errorMessage = await getErrorMessage(response);
    throw new Error(errorMessage);
  }

  const data: PaginatedResponse<InvitationNotification> = await response.json();
  return (data.items || []).map((notification) => ({
    ...notification,
    payload: notification.payload ?? {},
  }));
};

/**
 * Mark a notification as read.
 */
export const markNotificationRead = async (notificationId: string): Promise<Notification> => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/notifications/${notificationId}/mark-read`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!response.ok) {
    const errorMessage = await getErrorMessage(response);
    throw new Error(errorMessage);
  }

  const updated: Notification = await response.json();
  return {
    ...updated,
    payload: updated.payload ?? {},
  };
};
