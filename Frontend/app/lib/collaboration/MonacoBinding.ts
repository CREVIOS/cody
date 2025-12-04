import { Y } from './yjsSingleton';
import type * as Monaco from 'monaco-editor';

/**
 * Monaco-Yjs Binding
 *
 * Bidirectional synchronization between Monaco Editor and Yjs Text CRDT.
 * Handles:
 * - Local edits → Yjs operations
 * - Remote Yjs operations → Monaco model updates
 * - Selection/cursor preservation
 * - Proper disposal and cleanup
 */

interface MonacoBindingOptions {
  /**
   * Monaco editor instance
   */
  editor: Monaco.editor.IStandaloneCodeEditor;

  /**
   * Yjs Text type to sync with
   */
  yText: Y.Text;

  /**
   * Awareness instance for cursor/selection sync
   */
  awareness?: any;
}

export class MonacoBinding {
  private editor: Monaco.editor.IStandaloneCodeEditor;
  private model: Monaco.editor.ITextModel;
  private yText: Y.Text;
  private awareness: any;

  private _modelContentChangedListener: Monaco.IDisposable | null = null;
  private _textObserver: ((event: Y.YTextEvent, transaction: Y.Transaction) => void) | null = null;
  private _cursorListener: Monaco.IDisposable | null = null;
  private _selectionListener: Monaco.IDisposable | null = null;

  private _muxCounter = 0; // Counter-based feedback loop prevention (more robust than boolean)
  private _savedViewState: Monaco.editor.ICodeEditorViewState | null = null;

  constructor(options: MonacoBindingOptions) {
    this.editor = options.editor;
    this.yText = options.yText;
    this.awareness = options.awareness;

    const model = this.editor.getModel();
    if (!model) {
      throw new Error('Monaco editor must have a model');
    }
    this.model = model;

    // Initialize with Yjs content if it exists
    this._initializeContent();

    // Setup bidirectional sync
    this._setupMonacoToYjs();
    this._setupYjsToMonaco();

    // Setup awareness (cursor/selection tracking)
    if (this.awareness) {
      this._setupAwareness();
    }
  }

  /**
   * Initialize Monaco with existing Yjs content
   */
  private _initializeContent() {
    const yContent = this.yText.toString();
    const monacoContent = this.model.getValue();

    if (yContent && yContent !== monacoContent) {
      this._muxCounter++;
      try {
        this.model.setValue(yContent);
      } finally {
        this._muxCounter--;
      }
    }
  }

  /**
   * Monaco changes → Yjs operations
   */
  private _setupMonacoToYjs() {
    this._modelContentChangedListener = this.model.onDidChangeContent((event) => {
      // Skip if change came from Yjs (counter > 0 means we're applying remote changes)
      if (this._muxCounter > 0) return;

      this.yText.doc?.transact(() => {
        event.changes
          .sort((a, b) => b.rangeOffset - a.rangeOffset) // Apply from end to start
          .forEach((change) => {
            const offset = change.rangeOffset;
            const deleteLength = change.rangeLength;
            const insertText = change.text;

            if (deleteLength > 0) {
              this.yText.delete(offset, deleteLength);
            }

            if (insertText.length > 0) {
              this.yText.insert(offset, insertText);
            }
          });
      }, this);
    });
  }

  /**
   * Yjs operations → Monaco changes
   */
  private _setupYjsToMonaco() {
    this._textObserver = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      // Skip if change originated from this binding
      if (transaction.origin === this) return;

      // Increment counter to prevent feedback loop
      this._muxCounter++;

      // Save cursor/selection position
      const selections = this.editor.getSelections();
      const viewState = this.editor.saveViewState();

      try {
        // Track cumulative offset as we process deltas
        let currentOffset = 0;

        event.delta.forEach((delta: any) => {
          if (delta.retain !== undefined) {
            // Skip forward in the document
            currentOffset += delta.retain;
          } else if (delta.insert !== undefined) {
            const insertText = delta.insert as string;
            const position = this.model.getPositionAt(currentOffset);

            this.model.applyEdits([
              {
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
                text: insertText,
              },
            ]);

            // Update offset to account for the insertion
            currentOffset += insertText.length;
          } else if (delta.delete !== undefined) {
            const deleteLength = delta.delete as number;
            const start = this.model.getPositionAt(currentOffset);
            const end = this.model.getPositionAt(currentOffset + deleteLength);

            this.model.applyEdits([
              {
                range: {
                  startLineNumber: start.lineNumber,
                  startColumn: start.column,
                  endLineNumber: end.lineNumber,
                  endColumn: end.column,
                },
                text: '',
              },
            ]);

            // Don't update offset for deletes - the content is removed
          }
        });

        // Restore cursor/selection if possible
        if (viewState) {
          this.editor.restoreViewState(viewState);
        }
        if (selections) {
          this.editor.setSelections(selections);
        }
      } finally {
        // Decrement counter to allow local edits again
        this._muxCounter--;
      }
    };

    this.yText.observe(this._textObserver);
  }

  /**
   * Setup cursor/selection awareness
   */
  private _setupAwareness() {
    // Track local cursor/selection
    this._cursorListener = this.editor.onDidChangeCursorPosition((event) => {
      // Skip if we're applying remote changes
      if (this._muxCounter > 0) return;

      const position = event.position;
      const offset = this.model.getOffsetAt(position);

      this.awareness.setLocalStateField('cursor', {
        line: position.lineNumber,
        column: position.column,
        offset,
        timestamp: Date.now(),
      });
    });

    this._selectionListener = this.editor.onDidChangeCursorSelection((event) => {
      // Skip if we're applying remote changes
      if (this._muxCounter > 0) return;

      const selection = event.selection;
      const startOffset = this.model.getOffsetAt({
        lineNumber: selection.startLineNumber,
        column: selection.startColumn,
      });
      const endOffset = this.model.getOffsetAt({
        lineNumber: selection.endLineNumber,
        column: selection.endColumn,
      });

      this.awareness.setLocalStateField('selection', {
        start: {
          line: selection.startLineNumber,
          column: selection.startColumn,
          offset: startOffset,
        },
        end: {
          line: selection.endLineNumber,
          column: selection.endColumn,
          offset: endOffset,
        },
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Get current document text
   */
  getText(): string {
    return this.yText.toString();
  }

  /**
   * Get Yjs document
   */
  getYDoc(): Y.Doc | null {
    return this.yText.doc;
  }

  /**
   * Destroy binding and cleanup
   */
  destroy() {
    // Remove Monaco listeners
    this._modelContentChangedListener?.dispose();
    this._cursorListener?.dispose();
    this._selectionListener?.dispose();

    // Remove Yjs observer
    if (this._textObserver) {
      this.yText.unobserve(this._textObserver);
    }

    // Clear references
    this._modelContentChangedListener = null;
    this._textObserver = null;
    this._cursorListener = null;
    this._selectionListener = null;
  }
}

/**
 * Create a Monaco binding with Yjs
 */
export function createMonacoBinding(
  editor: Monaco.editor.IStandaloneCodeEditor,
  yText: Y.Text,
  awareness?: any
): MonacoBinding {
  return new MonacoBinding({ editor, yText, awareness });
}
