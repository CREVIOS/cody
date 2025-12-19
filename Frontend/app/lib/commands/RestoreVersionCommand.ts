import { BaseCommand } from './BaseCommand';
import { CommandData } from './Command';

/**
 * Command Pattern: RestoreVersionCommand
 *
 * Restores a file to a previous version from MinIO versioning.
 * This command is undoable - it can revert back to the content before restore.
 *
 * Design Pattern: Command Pattern
 * - Encapsulates restore operation as an object
 * - Supports undo/redo functionality
 * - Can be queued, logged, or serialized
 */

export interface FileVersion {
  versionId: string;
  isLatest: boolean;
  lastModified: string;
  size: number;
  etag: string;
  isDeleteMarker: boolean;
}

export interface VersionService {
  listFileVersions(projectId: string, filePath: string): Promise<{ success: boolean; versions: FileVersion[] }>;
  getFileVersion(projectId: string, filePath: string, versionId: string): Promise<{ success: boolean; content: string }>;
  restoreFileVersion(projectId: string, filePath: string, versionId: string): Promise<{ success: boolean }>;
  getCurrentFileContent(projectId: string, filePath: string): Promise<{ success: boolean; content: string }>;
}

export class RestoreVersionCommand extends BaseCommand {
  private previousContent: string | null = null;
  private previousVersionId: string | null = null;
  private restoredContent: string | null = null;

  constructor(
    userId: string,
    projectId: string,
    private filePath: string,
    private targetVersionId: string,
    private versionService: VersionService,
    private onContentUpdate?: (content: string) => void
  ) {
    super(userId, projectId);
  }

  getDescription(): string {
    return `Restore ${this.filePath} to previous version`;
  }

  protected async doExecute(): Promise<void> {
    // 1. Get current version ID before restoring
    const versionsResponse = await this.versionService.listFileVersions(
      this.projectId,
      this.filePath
    );

    if (!versionsResponse.success || !versionsResponse.versions) {
      throw new Error('Failed to list file versions');
    }

    // Find the latest version
    const latestVersion = versionsResponse.versions.find(v => v.isLatest);
    if (latestVersion) {
      this.previousVersionId = latestVersion.versionId;
    }

    // 2. Save current content for undo
    const currentResponse = await this.versionService.getCurrentFileContent(
      this.projectId,
      this.filePath
    );

    if (!currentResponse.success) {
      throw new Error('Failed to get current file content');
    }

    this.previousContent = currentResponse.content;

    // 3. Get the target version content
    const versionResponse = await this.versionService.getFileVersion(
      this.projectId,
      this.filePath,
      this.targetVersionId
    );

    if (!versionResponse.success) {
      throw new Error('Failed to get version content');
    }

    this.restoredContent = versionResponse.content;

    // 4. Restore to the target version (creates a new version in MinIO)
    const restoreResponse = await this.versionService.restoreFileVersion(
      this.projectId,
      this.filePath,
      this.targetVersionId
    );

    if (!restoreResponse.success) {
      throw new Error('Failed to restore version');
    }

    // 5. Notify UI to update content
    if (this.onContentUpdate && this.restoredContent) {
      this.onContentUpdate(this.restoredContent);
    }
  }

  protected async doUndo(): Promise<void> {
    if (!this.previousVersionId) {
      throw new Error('Cannot undo: previous version ID not saved');
    }

    // Restore back to the version before the restore operation
    const response = await this.versionService.restoreFileVersion(
      this.projectId,
      this.filePath,
      this.previousVersionId
    );

    if (!response.success) {
      throw new Error('Failed to undo restore');
    }

    // Update UI with previous content
    if (this.onContentUpdate && this.previousContent) {
      this.onContentUpdate(this.previousContent);
    }
  }

  /**
   * Check if this command can be undone
   * Can undo if we have stored the previous version ID
   */
  canUndo(): boolean {
    return this.previousVersionId !== null;
  }

  /**
   * Serialization for audit trails and command history
   */
  serialize(): CommandData {
    return {
      type: 'RESTORE_VERSION',
      timestamp: this.timestamp,
      userId: this.userId,
      projectId: this.projectId,
      metadata: {
        filePath: this.filePath,
        targetVersionId: this.targetVersionId,
        previousVersionId: this.previousVersionId,
        hasPreviousContent: this.previousContent !== null,
        hasRestoredContent: this.restoredContent !== null
      }
    };
  }
}
