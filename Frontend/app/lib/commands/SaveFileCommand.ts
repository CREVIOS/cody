/**
 * Save File Command
 *
 * Encapsulates file saving as a reversible command using MinIO versioning.
 * This enables undo/redo of file saves by tracking version IDs.
 *
 * Design Pattern: Command Pattern
 * - Encapsulates save operation as an object
 * - Supports undo/redo functionality using MinIO versions
 * - Can be queued, logged, or serialized
 */

import { BaseCommand } from './BaseCommand';
import { CommandData } from './Command';

export interface SaveFileService {
  getCurrentVersionId(projectId: string, filePath: string): Promise<{ success: boolean; versionId: string | null; exists: boolean }>;
  updateFile(projectId: string, filePath: string, content: string): Promise<{ success: boolean; versionId?: string; versionNumber?: number }>;
  restoreFileVersion(projectId: string, filePath: string, versionId: string): Promise<{ success: boolean }>;
  getFileVersion(projectId: string, filePath: string, versionId: string): Promise<{ success: boolean; content: string }>;
  readFile(projectId: string, filePath: string): Promise<{ success: boolean; content: string }>;
  // Phase 6: Optional callback to update Y.Doc when restoring versions
  updateYDocContent?: (content: string) => void;
}

export class SaveFileCommand extends BaseCommand {
  private previousVersionId: string | null = null;
  private previousContent: string | null = null; // Content BEFORE this save
  private newVersionId: string | null = null;
  private savedContent: string; // Content being saved (AFTER edits)

  constructor(
    userId: string,
    projectId: string,
    private filePath: string,
    private newContent: string, // New content being saved
    private previousContentBeforeSave: string | null, // Content that was in editor BEFORE save
    private saveFileService: SaveFileService,
    private onContentUpdate?: (content: string) => void
  ) {
    super(userId, projectId);
    this.savedContent = newContent;
    // Store the content that was in the editor before this save
    this.previousContent = previousContentBeforeSave;
  }

  getDescription(): string {
    const fileName = this.filePath.split('/').pop() || this.filePath;
    return `Save "${fileName}"`;
  }

  protected async doExecute(): Promise<void> {
    // CRITICAL FIX: Wait for previous version ID to be fetched before saving
    // This ensures we have the correct previousVersionId for undo operations
    // especially important after app reload when version history needs to be tracked
    try {
      const versionResponse = await this.saveFileService.getCurrentVersionId(
        this.projectId,
        this.filePath
      );
      
      if (versionResponse.success && versionResponse.exists && versionResponse.versionId) {
        this.previousVersionId = versionResponse.versionId;
      }
    } catch (error) {
      console.warn('Could not get current version ID before save:', error);
      // Continue anyway - we'll handle null previousVersionId in undo
    }

    // Phase 6 Step 1: Save the file (creates new version in MinIO and DB) - THIS IS THE CRITICAL PATH
    const saveResponse = await this.saveFileService.updateFile(
      this.projectId,
      this.filePath,
      this.newContent
    );

    if (!saveResponse.success) {
      throw new Error('Failed to save file');
    }

    // Phase 6 Step 6: Store versionId from response (if available)
    if (saveResponse.versionId) {
      this.newVersionId = saveResponse.versionId;
      
      // Phase 7: Dev-only logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[Phase 7] Save succeeded with versionId:', {
          versionId: this.newVersionId,
          versionNumber: saveResponse.versionNumber,
          filePath: this.filePath,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      // Fallback: Try to get version ID after save (for backward compatibility)
      await this.trackNewVersionId();
    }

    // 3. Fetch the actual saved content from MinIO to ensure UI matches
    // This is important to handle any edge cases where content might differ
    try {
      // Wait a bit for MinIO to fully process the save
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const currentContentResponse = await this.saveFileService.readFile(
        this.projectId,
        this.filePath
      );
      
      if (currentContentResponse.success && this.onContentUpdate) {
        // Update UI with actual content from MinIO
        this.onContentUpdate(currentContentResponse.content);
        // Update savedContent to match what's actually in MinIO
        this.savedContent = currentContentResponse.content;
      }
    } catch (error) {
      console.warn('Could not fetch saved content from MinIO, using provided content:', error);
      // Fallback: use the content we saved
      if (this.onContentUpdate) {
        this.onContentUpdate(this.newContent);
      }
    }
  }

  /**
   * Track new version ID after save/restore operations
   * Waits for MinIO to process the new version and retrieves the version ID
   */
  private async trackNewVersionId(): Promise<void> {
    let retries = 5; // Increased retries for better reliability
    let retryDelay = 100; // Initial delay of 100ms
    
    while (retries > 0) {
      try {
        // Wait before checking (exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms)
        await new Promise(resolve => setTimeout(resolve, retryDelay));

        const newVersionResponse = await this.saveFileService.getCurrentVersionId(
          this.projectId,
          this.filePath
        );

        if (newVersionResponse.success && newVersionResponse.exists && newVersionResponse.versionId) {
          // Check if version ID changed (new version was created)
          if (newVersionResponse.versionId !== this.previousVersionId) {
            this.newVersionId = newVersionResponse.versionId;
            return; // Success - exit early
          }
          // If version ID is same but file exists, MinIO might not have processed yet
          // Continue to retry
        }
      } catch (error) {
        console.warn(`Could not get new version ID after save (${retries} retries left):`, error);
      }
      retries--;
      retryDelay *= 2; // Double the delay for next retry
    }
    
    // If we still don't have a new version ID, log a warning but don't fail
    // The save was successful, version tracking is just for undo/redo
    if (!this.newVersionId && this.previousVersionId) {
      console.warn('Could not retrieve new version ID after save, but save was successful');
    }
  }

  protected async doUndo(): Promise<void> {
    // Phase 6 Step 6: Undo - restore previous version from MinIO
    if (!this.previousVersionId) {
      // No previous version - restore to previous content
      if (this.previousContent === null) {
        throw new Error('Cannot undo: previous content not available');
      }
      
      // Update with previous content
      const updateResponse = await this.saveFileService.updateFile(
        this.projectId,
        this.filePath,
        this.previousContent
      );

      if (!updateResponse.success) {
        throw new Error('Failed to undo save');
      }
      
      // Update UI and Y.Doc
      if (this.onContentUpdate) {
        this.onContentUpdate(this.previousContent);
      }
      if (this.saveFileService.updateYDocContent) {
        this.saveFileService.updateYDocContent(this.previousContent);
      }
      return;
    }

      // Phase 6 Step 6: Fetch previous version content from API
      try {
        const versionContentResponse = await this.saveFileService.getFileVersion(
          this.projectId,
          this.filePath,
          this.previousVersionId
        );

        if (!versionContentResponse.success) {
          throw new Error('Failed to fetch previous version content');
        }

        const restoredContent = versionContentResponse.content;
        
        // Phase 7: Dev-only logging
        if (process.env.NODE_ENV === 'development') {
          console.log('[Phase 7] Undo: Restoring version', {
            versionId: this.previousVersionId,
            filePath: this.filePath,
            contentLength: restoredContent.length,
            timestamp: new Date().toISOString(),
          });
        }

      // Restore file to previous version in MinIO (creates new version)
      const restoreResponse = await this.saveFileService.restoreFileVersion(
        this.projectId,
        this.filePath,
        this.previousVersionId
      );

      if (!restoreResponse.success) {
        throw new Error('Failed to restore previous version');
      }

      // Phase 6 Step 6: Update Y.Doc with restored content
      if (this.saveFileService.updateYDocContent) {
        this.saveFileService.updateYDocContent(restoredContent);
        console.log('[SaveFileCommand] Updated Y.Doc with restored version content');
      }

      // Update UI with restored content
      if (this.onContentUpdate) {
        this.onContentUpdate(restoredContent);
      }

      // Track the new version ID after restore (for potential redo)
      this.trackNewVersionId().catch(error => {
        console.warn('Background version tracking failed on undo:', error);
      });
      
    } catch (error) {
      console.error('Error during undo:', error);
      // Fallback: try to restore using previous content
      if (this.previousContent !== null) {
        const updateResponse = await this.saveFileService.updateFile(
          this.projectId,
          this.filePath,
          this.previousContent
        );
        if (updateResponse.success && this.onContentUpdate) {
          this.onContentUpdate(this.previousContent);
        }
        if (updateResponse.success && this.saveFileService.updateYDocContent) {
          this.saveFileService.updateYDocContent(this.previousContent);
        }
      } else {
        throw error;
      }
    }
  }


  /**
   * Override redo() to restore to saved content
   * 
   * Command Pattern Note: While the standard pattern has redo() call execute() again,
   * for save operations we need to restore to the saved content (savedContent) rather
   * than re-executing with newContent. This is a valid variation of the pattern for
   * operations that need to restore to a specific state rather than re-execute.
   */
  async redo(): Promise<void> {
    if (this.executed) {
      throw new Error(`Command already executed: ${this.getDescription()}`);
    }
    
    if (!this.savedContent) {
      throw new Error('Cannot redo: saved content not available');
    }

    // Get current version ID before redo (to track what we're redoing from)
    try {
      const currentVersionResponse = await this.saveFileService.getCurrentVersionId(
        this.projectId,
        this.filePath
      );
      if (currentVersionResponse.success && currentVersionResponse.exists && currentVersionResponse.versionId) {
        // Store the version we're redoing from (for potential undo of redo)
        this.previousVersionId = currentVersionResponse.versionId;
      }
    } catch (error) {
      console.warn('Could not get current version ID before redo:', error);
    }

    // Phase 6 Step 6: Redo - restore to saved content
    const saveResponse = await this.saveFileService.updateFile(
      this.projectId,
      this.filePath,
      this.savedContent
    );

    if (!saveResponse.success) {
      throw new Error('Failed to redo save');
    }

    // Phase 6 Step 6: Update Y.Doc with saved content
    if (this.saveFileService.updateYDocContent) {
      this.saveFileService.updateYDocContent(this.savedContent);
      console.log('[SaveFileCommand] Updated Y.Doc with redo content');
    }
    
    // Phase 7: Dev-only logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Phase 7] Redo: Restored saved content', {
        filePath: this.filePath,
        contentLength: this.savedContent.length,
        versionId: saveResponse.versionId,
        timestamp: new Date().toISOString(),
      });
    }

    // Update UI with saved content
    if (this.onContentUpdate) {
      this.onContentUpdate(this.savedContent);
    }

    // Track new version ID after redo
    if (saveResponse.versionId) {
      this.newVersionId = saveResponse.versionId;
    } else {
      await this.trackNewVersionId();
    }

    this.executed = true;
  }

  canUndo(): boolean {
    // Can undo if we have a previous version ID OR if this is a new file (can restore to empty)
    // For new files, previousVersionId will be null, but we can still undo by restoring to empty
    // For existing files, we need the previousVersionId to restore to that version
    return true; // Always allow undo - if no previousVersionId, we'll handle it in doUndo()
  }

  serialize(): CommandData {
    return {
      type: 'SAVE_FILE',
      timestamp: this.timestamp,
      userId: this.userId,
      projectId: this.projectId,
      metadata: {
        filePath: this.filePath,
        previousVersionId: this.previousVersionId,
        newVersionId: this.newVersionId,
        contentLength: this.savedContent.length,
        hasPreviousContent: this.previousContent !== null
      }
    };
  }
}
