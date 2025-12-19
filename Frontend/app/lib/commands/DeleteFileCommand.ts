/**
 * Delete File Command
 *
 * Encapsulates file deletion as a reversible command.
 *
 * Key Challenge: To support undo, we must store the file content BEFORE deleting.
 * Research: "The 'hide, don't destroy' method works well, and the drawback of
 * taking up memory is minimised by culling old commands."
 */

import { BaseCommand } from './BaseCommand';
import { CommandData } from './Command';

export class DeleteFileCommand extends BaseCommand {
  private deletedContent?: string; // Store for undo
  private deletedMetadata?: {
    name: string;
    size: number;
    lastModified?: Date;
  };

  constructor(
    userId: string,
    projectId: string,
    private readonly filePath: string,
    private readonly fileSystemService: {
      readFile: (projectId: string, path: string) => Promise<string>;
      deleteItem: (projectId: string, path: string) => Promise<void>;
      createFile: (projectId: string, path: string, content: string) => Promise<void>;
    }
  ) {
    super(userId, projectId);
  }

  protected async doExecute(): Promise<void> {
    // CRITICAL: Read file content BEFORE deleting (for undo)
    try {
      this.deletedContent = await this.fileSystemService.readFile(
        this.projectId,
        this.filePath
      );

      // Store metadata for restoration
      this.deletedMetadata = {
        name: this.filePath.split('/').pop() || this.filePath,
        size: new Blob([this.deletedContent]).size,
        lastModified: new Date(),
      };
    } catch (error) {
      console.warn('Could not read file before deletion:', error);
      // Continue with deletion even if read fails (file might not exist)
    }

    // Now delete the file
    await this.fileSystemService.deleteItem(this.projectId, this.filePath);
  }

  protected async doUndo(): Promise<void> {
    // If content wasn't stored (e.g., file didn't exist or read failed),
    // create an empty file as a fallback
    const contentToRestore = this.deletedContent ?? '';
    
    // Recreate the file with original content (or empty if not stored)
    await this.fileSystemService.createFile(
      this.projectId,
      this.filePath,
      contentToRestore
    );
  }

  getDescription(): string {
    return `Delete file "${this.filePath}"`;
  }

  canUndo(): boolean {
    // Can always undo delete - if content wasn't stored, we'll restore an empty file
    // This prevents errors when undo is attempted after a failed read
    return true;
  }

  serialize(): CommandData {
    return {
      type: 'DELETE_FILE',
      timestamp: this.timestamp,
      userId: this.userId,
      projectId: this.projectId,
      metadata: {
        filePath: this.filePath,
        // Include deleted content for audit trail
        // (in production, you might store this in a separate archive)
        deletedSize: this.deletedMetadata?.size || 0,
        deletedName: this.deletedMetadata?.name || '',
      },
    };
  }
}
