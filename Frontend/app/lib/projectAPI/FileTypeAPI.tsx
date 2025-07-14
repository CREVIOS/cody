import { API_BASE_URL } from './APIConfiguration';
import { getErrorMessage } from './ErrorHandling';
import { PaginatedResponse } from './TypeDefinitions';

// File Type interface
export interface FileType {
  file_type_id: string;
  type_name: string;
  extension: string;
  mime_type: string;
  icon_class: string | null;
  syntax_mode: string | null;
  is_executable: boolean;
  is_binary: boolean;
  default_content: string | null;
}

// Create a cache for file types to avoid excessive API calls
let fileTypesCache: FileType[] | null = null;

export const FileTypeAPI = {
  // Get all file types
  async getAllFileTypes(): Promise<FileType[]> {
    try {
      // Return cached result if available
      if (fileTypesCache) {
        return fileTypesCache;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/file-types/?limit=100`);

      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }

      const data: PaginatedResponse<FileType> = await response.json();
      fileTypesCache = data.items;
      return data.items;
    } catch (error) {
      console.error('Failed to fetch file types:', error);
      return [];
    }
  },

  // Get a specific file type by ID
  async getFileTypeById(fileTypeId: string): Promise<FileType | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/file-types/${fileTypeId}`);

      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch file type:', error);
      return null;
    }
  },

  // Get file type by extension
  async getFileTypeByExtension(extension: string): Promise<FileType | null> {
    try {
      // Get all file types first (uses cache if available)
      const types = await this.getAllFileTypes();
      
      // Find the matching file type by extension
      const normalizedExt = extension.startsWith('.') 
        ? extension.substring(1).toLowerCase() 
        : extension.toLowerCase();
      
      const fileType = types.find(type => 
        type.extension.toLowerCase() === normalizedExt
      );
      
      return fileType || null;
    } catch (error) {
      console.error('Failed to get file type by extension:', error);
      return null;
    }
  },

  // Clear the cache (useful when file types might have been updated)
  clearCache() {
    fileTypesCache = null;
  }
}; 