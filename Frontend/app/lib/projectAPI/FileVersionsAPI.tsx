/**
 * File Versions API Client
 * 
 * Phase 6: Handles file version operations including:
 * - Saving file content with version creation
 * - Fetching version content for undo/redo
 * - Listing file versions
 */

import { API_BASE_URL } from "./APIConfiguration";

const BASE_URL = `${API_BASE_URL.replace(/\/+$/, "")}/api/v1`;

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
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileIdentifier);
  const queryParams = new URLSearchParams({
    user_id: userId,
    project_id: projectId,
  });
  
  const url = `${BASE_URL}/files/${encodeURIComponent(fileIdentifier)}/save-content?${queryParams.toString()}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        message,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save file: ${response.status} ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error saving file content:', error);
    throw error;
  }
}

/**
 * Get content of a specific file version
 */
export async function getFileVersionContent(
  versionId: string,
  projectId: string
): Promise<FileVersionContentResponse> {
  const url = `${BASE_URL}/file-versions/${versionId}/content?project_id=${projectId}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get version content: ${response.status} ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting file version content:', error);
    throw error;
  }
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
  const queryParams = new URLSearchParams({
    file_id: fileId,
    skip: skip.toString(),
    limit: limit.toString(),
  });
  
  const url = `${BASE_URL}/file-versions?${queryParams.toString()}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list file versions: ${response.status} ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error listing file versions:', error);
    throw error;
  }
}
