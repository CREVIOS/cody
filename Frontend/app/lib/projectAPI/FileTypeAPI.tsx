import { BaseAPITemplateSilentFail } from "./BaseAPITemplate";
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
    // Return cached result if available
    if (fileTypesCache) {
      return fileTypesCache;
    }

    class GetAllFileTypesCall extends BaseAPITemplateSilentFail<FileType[]> {
      protected buildURL(): string {
        return `${this.getBaseURL()}/api/v1/file-types/?limit=100`;
      }

      protected buildOptions(): RequestInit {
        return { method: "GET" };
      }

      protected async parseResponse(response: Response): Promise<FileType[]> {
        const data: PaginatedResponse<FileType> = await response.json();
        return data.items || [];
      }

      protected onSuccess(data: FileType[]): void {
        fileTypesCache = data;
      }

      protected getFallbackValue(): FileType[] {
        return [];
      }

      protected async onError(message: string): Promise<void> {
        console.error("Failed to fetch file types:", message);
      }
    }

    return new GetAllFileTypesCall().execute();
  },

  // Get a specific file type by ID
  async getFileTypeById(fileTypeId: string): Promise<FileType | null> {
    class GetFileTypeByIdCall extends BaseAPITemplateSilentFail<FileType | null> {
      constructor(private fileTypeId: string) {
        super();
      }

      protected buildURL(): string {
        return `${this.getBaseURL()}/api/v1/file-types/${this.fileTypeId}`;
      }

      protected buildOptions(): RequestInit {
        return { method: "GET" };
      }

      protected async parseResponse(response: Response): Promise<FileType | null> {
        return response.json();
      }

      protected getFallbackValue(): FileType | null {
        return null;
      }

      protected async onError(message: string): Promise<void> {
        console.error("Failed to fetch file type:", message);
      }
    }

    return new GetFileTypeByIdCall(fileTypeId).execute();
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