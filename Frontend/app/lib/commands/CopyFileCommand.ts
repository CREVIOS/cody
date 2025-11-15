/**
 * Copy File Command
 *
 * Encapsulates file copying as a reversible command.
 * Undo deletes the copied file.
 */

import { BaseCommand } from './BaseCommand';
import { CommandData } from './Command';

export class CopyFileCommand extends BaseCommand {
  constructor(
    userId: string,
    projectId: string,
    private readonly sourcePath: string,
    private readonly destinationPath: string,
    private readonly fileSystemService: {
      copyItem: (projectId: string, source: string, destination: string) => Promise<void>;
      deleteItem: (projectId: string, path: string) => Promise<void>;
    }
  ) {
    super(userId, projectId);
  }

  protected async doExecute(): Promise<void> {
    await this.fileSystemService.copyItem(
      this.projectId,
      this.sourcePath,
      this.destinationPath
    );
  }

  protected async doUndo(): Promise<void> {
    // Delete the copied file
    await this.fileSystemService.deleteItem(
      this.projectId,
      this.destinationPath
    );
  }

  getDescription(): string {
    return `Copy "${this.sourcePath}" to "${this.destinationPath}"`;
  }

  canUndo(): boolean {
    return true; // Copy is undoable (delete the copy)
  }

  serialize(): CommandData {
    return {
      type: 'COPY_FILE',
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
