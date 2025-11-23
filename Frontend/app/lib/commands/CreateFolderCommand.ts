/**
 * Create Folder Command
 *
 * Encapsulates folder creation as a reversible command.
 * Undo deletes the created folder.
 *
 * Design Pattern: Command Pattern
 * - Encapsulates create folder operation as an object
 * - Supports undo/redo functionality
 * - Can be queued, logged, or serialized
 */

import { BaseCommand } from './BaseCommand';
import { CommandData } from './Command';

export class CreateFolderCommand extends BaseCommand {
  constructor(
    userId: string,
    projectId: string,
    private readonly folderPath: string,
    private readonly fileSystemService: {
      createFolder: (projectId: string, path: string) => Promise<void>;
      deleteItem: (projectId: string, path: string) => Promise<void>;
    },
    private onFolderCreated?: (path: string) => void
  ) {
    super(userId, projectId);
  }

  protected async doExecute(): Promise<void> {
    await this.fileSystemService.createFolder(
      this.projectId,
      this.folderPath
    );

    // Notify that folder was created
    if (this.onFolderCreated) {
      this.onFolderCreated(this.folderPath);
    }
  }

  protected async doUndo(): Promise<void> {
    // Delete the created folder
    await this.fileSystemService.deleteItem(
      this.projectId,
      this.folderPath
    );
  }

  getDescription(): string {
    const folderName = this.folderPath.split('/').pop() || this.folderPath;
    return `Create folder "${folderName}"`;
  }

  canUndo(): boolean {
    return true; // Create folder is always undoable (delete the folder)
  }

  serialize(): CommandData {
    return {
      type: 'CREATE_FOLDER',
      timestamp: this.timestamp,
      userId: this.userId,
      projectId: this.projectId,
      metadata: {
        folderPath: this.folderPath,
      },
    };
  }
}

