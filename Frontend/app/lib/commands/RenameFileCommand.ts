/**
 * Rename File Command
 *
 * Encapsulates file renaming as a reversible command.
 * Undo simply renames the file back to its original name.
 */

import { BaseCommand } from './BaseCommand';
import { CommandData } from './Command';

export class RenameFileCommand extends BaseCommand {
  constructor(
    userId: string,
    projectId: string,
    private readonly oldPath: string,
    private readonly newPath: string,
    private readonly fileSystemService: {
      renameItem: (projectId: string, oldPath: string, newPath: string) => Promise<void>;
    }
  ) {
    super(userId, projectId);
  }

  protected async doExecute(): Promise<void> {
    await this.fileSystemService.renameItem(
      this.projectId,
      this.oldPath,
      this.newPath
    );
  }

  protected async doUndo(): Promise<void> {
    // Rename back to original name
    await this.fileSystemService.renameItem(
      this.projectId,
      this.newPath,
      this.oldPath
    );
  }

  getDescription(): string {
    const oldName = this.oldPath.split('/').pop() || this.oldPath;
    const newName = this.newPath.split('/').pop() || this.newPath;
    return `Rename "${oldName}" to "${newName}"`;
  }

  canUndo(): boolean {
    return true; // Rename is always undoable
  }

  serialize(): CommandData {
    return {
      type: 'RENAME_FILE',
      timestamp: this.timestamp,
      userId: this.userId,
      projectId: this.projectId,
      metadata: {
        oldPath: this.oldPath,
        newPath: this.newPath,
      },
    };
  }
}
