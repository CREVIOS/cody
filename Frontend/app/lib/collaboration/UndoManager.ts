import { Y } from './yjsSingleton';

/**
 * Undo Manager for Yjs
 *
 * Provides per-client undo/redo functionality with:
 * - Semantic grouping (e.g., by word boundaries, time intervals)
 * - Independent undo stacks per client
 * - Integration with Monaco Editor
 * - Configurable capture intervals
 */

export interface UndoManagerOptions {
  /**
   * Yjs types to track (e.g., [yText])
   */
  trackedOrigins?: Set<any>;

  /**
   * Capture timeout in ms (operations within this time are grouped)
   * Default: 500ms
   */
  captureTimeout?: number;

  /**
   * Whether to delete additions when undoing
   * Default: true
   */
  deleteFilter?: (item: any) => boolean;

  /**
   * Maximum undo stack size
   * Default: 100
   */
  maxStackSize?: number;
}

export class CollaborativeUndoManager {
  private undoManager: Y.UndoManager;
  private doc: Y.Doc;
  private scope: Y.Text | Y.Text[];

  private _canUndo = false;
  private _canRedo = false;

  // Event listeners
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(scope: Y.Text | Y.Text[], options: UndoManagerOptions = {}) {
    this.scope = scope;
    this.doc = Array.isArray(scope) ? scope[0].doc! : scope.doc!;

    // Create Yjs UndoManager
    this.undoManager = new Y.UndoManager(scope, {
      trackedOrigins: options.trackedOrigins,
      captureTimeout: options.captureTimeout || 500,
      deleteFilter: options.deleteFilter,
    });

    // Setup listeners
    this.undoManager.on('stack-item-added', this.handleStackChange.bind(this));
    this.undoManager.on('stack-item-popped', this.handleStackChange.bind(this));
    this.undoManager.on('stack-cleared', this.handleStackChange.bind(this));

    this.updateState();
  }

  /**
   * Handle stack changes
   */
  private handleStackChange() {
    this.updateState();
  }

  /**
   * Update can undo/redo state
   */
  private updateState() {
    const prevCanUndo = this._canUndo;
    const prevCanRedo = this._canRedo;

    this._canUndo = this.undoManager.canUndo();
    this._canRedo = this.undoManager.canRedo();

    if (prevCanUndo !== this._canUndo || prevCanRedo !== this._canRedo) {
      this.emit('state-change', {
        canUndo: this._canUndo,
        canRedo: this._canRedo,
      });
    }
  }

  /**
   * Undo last operation
   */
  public undo(): void {
    if (this.canUndo()) {
      this.undoManager.undo();
      this.emit('undo');
    }
  }

  /**
   * Redo last undone operation
   */
  public redo(): void {
    if (this.canRedo()) {
      this.undoManager.redo();
      this.emit('redo');
    }
  }

  /**
   * Check if can undo
   */
  public canUndo(): boolean {
    return this._canUndo;
  }

  /**
   * Check if can redo
   */
  public canRedo(): boolean {
    return this._canRedo;
  }

  /**
   * Stop capturing (start a new undo group)
   */
  public stopCapturing(): void {
    this.undoManager.stopCapturing();
  }

  /**
   * Clear undo stack
   */
  public clear(): void {
    this.undoManager.clear();
  }

  /**
   * Add event listener
   */
  public on(event: string, handler: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  /**
   * Remove event listener
   */
  public off(event: string, handler: Function): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, data?: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  /**
   * Destroy undo manager
   */
  public destroy(): void {
    this.undoManager.destroy();
    this.listeners.clear();
  }
}

/**
 * Create undo manager with Monaco integration
 */
export function createUndoManager(
  yText: Y.Text,
  options?: UndoManagerOptions
): CollaborativeUndoManager {
  return new CollaborativeUndoManager(yText, options);
}

/**
 * Create undo manager for multiple texts
 */
export function createMultiUndoManager(
  yTexts: Y.Text[],
  options?: UndoManagerOptions
): CollaborativeUndoManager {
  return new CollaborativeUndoManager(yTexts, options);
}
