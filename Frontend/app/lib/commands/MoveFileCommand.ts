/**
 * Move File Command
 *
 * Encapsulates file moving as a reversible command.
 * Undo moves the file back to its original location.
 */

import { BaseCommand } from './BaseCommand';
import { CommandData } from './Command';

export class MoveFileCommand extends BaseCommand {
  constructor(
    userId: string,
    projectId: string,
    private readonly sourcePath: string,
    private readonly destinationPath: string,
    private readonly fileSystemService: {
      moveItem: (projectId: string, source: string, destination: string) => Promise<void>;
    }
  ) {
    super(userId, projectId);
  }

  protected async doExecute(): Promise<void> {
    await this.fileSystemService.moveItem(
      this.projectId,
      this.sourcePath,
      this.destinationPath
    );
  }

  protected async doUndo(): Promise<void> {
    // Move back to original location
    await this.fileSystemService.moveItem(
      this.projectId,
      this.destinationPath,
      this.sourcePath
    );
  }

  getDescription(): string {
    return `Move "${this.sourcePath}" to "${this.destinationPath}"`;
  }

  canUndo(): boolean {
    return true; // Move is always undoable
  }

  serialize(): CommandData {
    return {
      type: 'MOVE_FILE',
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
