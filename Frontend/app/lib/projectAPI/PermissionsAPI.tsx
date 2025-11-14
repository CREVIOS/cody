import { API_BASE_URL } from "./APIConfiguration";
import { getErrorMessage } from "./ErrorHandling";

export interface UserProjectPermissionsResponse {
  project_id: string;
  user_id: string;
  role_id: string | null;
  role_name: string;
  permissions: Record<string, boolean>;
}

export async function getUserProjectPermissions(projectId: string, userId: string): Promise<UserProjectPermissionsResponse> {
  try {
    const url = `${API_BASE_URL}/api/v1/permissions/projects/${projectId}?user_id=${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const msg = await getErrorMessage(res);
      throw new Error(msg);
    }

    return await res.json();
  } catch (err) {
    console.error("Error fetching user project permissions:", err);
    throw err;
  }
}


