/**
 * Create File Command
 *
 * Encapsulates file creation as a reversible command.
 * Undo deletes the created file.
 *
 * Design Pattern: Command Pattern
 * - Encapsulates create operation as an object
 * - Supports undo/redo functionality
 * - Can be queued, logged, or serialized
 */

import { BaseCommand } from './BaseCommand';
import { CommandData } from './Command';

export class CreateFileCommand extends BaseCommand {
  constructor(
    userId: string,
    projectId: string,
    private readonly filePath: string,
    private readonly content: string,
    private readonly fileSystemService: {
      createFile: (projectId: string, path: string, content: string) => Promise<void>;
      deleteItem: (projectId: string, path: string) => Promise<void>;
    },
    private onFileCreated?: (path: string) => void
  ) {
    super(userId, projectId);
  }

  protected async doExecute(): Promise<void> {
    await this.fileSystemService.createFile(
      this.projectId,
      this.filePath,
      this.content
    );

    // Notify that file was created
    if (this.onFileCreated) {
      this.onFileCreated(this.filePath);
    }
  }

  protected async doUndo(): Promise<void> {
    // Delete the created file
    await this.fileSystemService.deleteItem(
      this.projectId,
      this.filePath
    );
  }

  getDescription(): string {
    const fileName = this.filePath.split('/').pop() || this.filePath;
    return `Create file "${fileName}"`;
  }

  canUndo(): boolean {
    return true; // Create is always undoable (delete the file)
  }

  serialize(): CommandData {
    return {
      type: 'CREATE_FILE',
      timestamp: this.timestamp,
      userId: this.userId,
      projectId: this.projectId,
      metadata: {
        filePath: this.filePath,
        contentLength: this.content.length,
      },
    };
  }
}

