import { BaseAPITemplate } from "./BaseAPITemplate";

export interface UserProjectPermissionsResponse {
  project_id: string;
  user_id: string;
  role_id: string | null;
  role_name: string;
  permissions: Record<string, boolean>;
}

export async function getUserProjectPermissions(projectId: string, userId: string): Promise<UserProjectPermissionsResponse> {
  class GetUserProjectPermissionsCall extends BaseAPITemplate<UserProjectPermissionsResponse> {
    constructor(
      private projectId: string,
      private userId: string
    ) {
      super();
    }

    protected buildURL(): string {
      return `${this.getBaseURL()}/api/v1/permissions/projects/${encodeURIComponent(this.projectId)}?user_id=${encodeURIComponent(this.userId)}`;
    }

    protected buildOptions(): RequestInit {
      return {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      };
    }

    protected async onError(message: string): Promise<void> {
      console.error("Error fetching user project permissions:", message);
    }
  }

  return new GetUserProjectPermissionsCall(projectId, userId).execute();
}


