/**
 * Duplicate File Command
 *
 * Encapsulates file duplication as a reversible command.
 * Undo deletes the duplicated file.
 *
 * Design Pattern: Command Pattern
 * - Encapsulates duplicate operation as an object
 * - Supports undo/redo functionality
 * - Can be queued, logged, or serialized
 */

import { BaseCommand } from './BaseCommand';
import { CommandData } from './Command';

export class DuplicateFileCommand extends BaseCommand {
  constructor(
    userId: string,
    projectId: string,
    private readonly sourcePath: string,
    private readonly destinationPath: string,
    private readonly fileSystemService: {
      readFile: (projectId: string, path: string) => Promise<string>;
      createFile: (projectId: string, path: string, content: string) => Promise<void>;
      deleteItem: (projectId: string, path: string) => Promise<void>;
    },
    private onFileDuplicated?: (sourcePath: string, destinationPath: string) => void
  ) {
    super(userId, projectId);
  }

  protected async doExecute(): Promise<void> {
    // Read the source file content
    const content = await this.fileSystemService.readFile(
      this.projectId,
      this.sourcePath
    );

    // Create the duplicate file with the same content
    await this.fileSystemService.createFile(
      this.projectId,
      this.destinationPath,
      content
    );

    // Notify that file was duplicated
    if (this.onFileDuplicated) {
      this.onFileDuplicated(this.sourcePath, this.destinationPath);
    }
  }

  protected async doUndo(): Promise<void> {
    // Delete the duplicated file
    await this.fileSystemService.deleteItem(
      this.projectId,
      this.destinationPath
    );
  }

  getDescription(): string {
    const sourceName = this.sourcePath.split('/').pop() || this.sourcePath;
    const destName = this.destinationPath.split('/').pop() || this.destinationPath;
    return `Duplicate "${sourceName}" to "${destName}"`;
  }

  canUndo(): boolean {
    return true; // Duplicate is undoable (delete the duplicate)
  }

  serialize(): CommandData {
    return {
      type: 'DUPLICATE_FILE',
      timestamp: this.timestamp,
      userId: this.userId,
      projectId: this.projectId,
      metadata: {
        sourcePath: this.sourcePath,
        destinationPath: this.destinationPath,
      },
    };
  }
}

