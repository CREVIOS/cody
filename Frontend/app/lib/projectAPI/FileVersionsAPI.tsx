/**
 * File Versions API Client
 * 
 * Phase 6: Handles file version operations including:
 * - Saving file content with version creation
 * - Fetching version content for undo/redo
 * - Listing file versions
 */

import { BaseAPITemplate } from "./BaseAPITemplate";

export interface FileVersionResponse {
  fileId: string;
  versionId: string;
  minioVersionId?: string;
  versionNumber: number;
  createdAt: string;
  size: number;
  savedBy: string;
  message?: string;
}

export interface FileVersionContentResponse {
  versionId: string;
  content: string;
  size: number;
  createdAt: string;
  createdBy: string;
}

const getBaseV1Url = (baseUrl: string): string => `${baseUrl.replace(/\/+$/, "")}/api/v1`;

/**
 * Save file content and create a new version
 */
export async function saveFileContent(
  fileIdentifier: string,
  projectId: string,
  userId: string,
  content: string,
  message?: string
): Promise<FileVersionResponse> {
  class SaveFileContentCall extends BaseAPITemplate<FileVersionResponse> {
    protected buildURL(): string {
      const queryParams = new URLSearchParams({
        user_id: userId,
        project_id: projectId,
      });

      const baseV1Url = getBaseV1Url(this.getBaseURL());
      return `${baseV1Url}/files/${encodeURIComponent(fileIdentifier)}/save-content?${queryParams.toString()}`;
    }

    protected buildOptions(): RequestInit {
      return {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          message,
        }),
      };
    }

    protected async getErrorMessage(response: Response): Promise<string> {
      const errorText = await response.text().catch(() => "");
      return `Failed to save file: ${response.status} ${errorText}`.trim();
    }

    protected async onError(message: string): Promise<void> {
      // Error handling - no logging
    }
  }

  return new SaveFileContentCall().execute();
}

/**
 * Get content of a specific file version
 */
export async function getFileVersionContent(
  versionId: string,
  projectId: string
): Promise<FileVersionContentResponse> {
  class GetFileVersionContentCall extends BaseAPITemplate<FileVersionContentResponse> {
    protected buildURL(): string {
      const baseV1Url = getBaseV1Url(this.getBaseURL());
      return `${baseV1Url}/file-versions/${encodeURIComponent(versionId)}/content?project_id=${encodeURIComponent(projectId)}`;
    }

    protected buildOptions(): RequestInit {
      return {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      };
    }

    protected async getErrorMessage(response: Response): Promise<string> {
      const errorText = await response.text().catch(() => "");
      return `Failed to get version content: ${response.status} ${errorText}`.trim();
    }

    protected async onError(message: string): Promise<void> {
      // Error handling - no logging
    }
  }

  return new GetFileVersionContentCall().execute();
}

/**
 * List all versions for a file
 */
export async function listFileVersions(
  fileId: string,
  skip: number = 0,
  limit: number = 100
): Promise<{
  items: Array<{
    version_id: string;
    file_id: string;
    version_number: number;
    version_link: string;
    size_in_bytes: number;
    created_at: string;
    created_by: string;
  }>;
  total: number;
  page: number;
  size: number;
  pages: number;
}> {
  type ListFileVersionsResponse = {
    items: Array<{
      version_id: string;
      file_id: string;
      version_number: number;
      version_link: string;
      size_in_bytes: number;
      created_at: string;
      created_by: string;
    }>;
    total: number;
    page: number;
    size: number;
    pages: number;
  };

  class ListFileVersionsCall extends BaseAPITemplate<ListFileVersionsResponse> {
    protected buildURL(): string {
      const queryParams = new URLSearchParams({
        file_id: fileId,
        skip: skip.toString(),
        limit: limit.toString(),
      });

      const baseV1Url = getBaseV1Url(this.getBaseURL());
      return `${baseV1Url}/file-versions?${queryParams.toString()}`;
    }

    protected buildOptions(): RequestInit {
      return {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      };
    }

    protected async getErrorMessage(response: Response): Promise<string> {
      const errorText = await response.text().catch(() => "");
      return `Failed to list file versions: ${response.status} ${errorText}`.trim();
    }

    protected async onError(message: string): Promise<void> {
      // Error handling - no logging
    }
  }

  return new ListFileVersionsCall().execute();
}
