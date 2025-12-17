import { Y } from './yjsSingleton';
import type * as Monaco from 'monaco-editor';

// Extend EventTarget for corruption events
if (typeof EventTarget === 'undefined') {
  // Polyfill for environments without EventTarget (shouldn't be needed in browser)
  console.warn('[MonacoBinding] EventTarget not available');
}

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

export class MonacoBinding extends EventTarget {
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
  private _isCorrupted = false; // Flag to prevent any processing on corrupted documents

  constructor(options: MonacoBindingOptions) {
    super(); // Must call super() before accessing 'this' when extending EventTarget
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
   * Mark document as corrupted and notify listeners once
   */
  private _markCorrupted(reason: { message: string; size: number }) {
    if (this._isCorrupted) return;
    this._isCorrupted = true;
    this.dispatchEvent(
      new CustomEvent('corruption-detected', {
        detail: reason,
      })
    );

    // Best‑effort cleanup to keep editor/Yjs in a safe state
    try {
      this.yText.delete(0, this.yText.length);
    } catch {
      // ignore
    }
    try {
      this.model.setValue('');
    } catch {
      // ignore
    }
  }

  /**
   * Initialize Monaco with existing Yjs content
   */
  private _initializeContent() {
    try {
      // Safety check: Validate Yjs document size
      let yLength: number;
      try {
        yLength = this.yText.length;
      } catch (e) {
        console.error('[MonacoBinding] Cannot get Yjs text length - document may be corrupted:', e);
        this._isCorrupted = true;
        this.dispatchEvent(new CustomEvent('corruption-detected', { 
          detail: { 
            size: 0,
            message: 'Cannot read document length - document corrupted'
          } 
        }));
        return;
      }
      
      const MAX_DOC_LENGTH = 10 * 1024 * 1024; // 10MB
      
      if (yLength > MAX_DOC_LENGTH) {
        console.error('[MonacoBinding] Yjs document too large during init:', yLength, 'bytes. Marking as corrupted.');
        this._isCorrupted = true;
        this.dispatchEvent(new CustomEvent('corruption-detected', { 
          detail: { 
            size: yLength,
            message: 'Document exceeded size limit during initialization'
          } 
        }));
        // Reset corrupted document
        try {
          this.yText.delete(0, this.yText.length);
        } catch {
          console.error('[MonacoBinding] Failed to reset large document');
        }
        return;
      }
      
      let yContent: string;
      try {
        yContent = this.yText.toString();
      } catch (e) {
        console.error('[MonacoBinding] Cannot convert Yjs to string - document corrupted:', e);
        // Try to reset
        try {
          this.yText.delete(0, this.yText.length);
        } catch {
          console.error('[MonacoBinding] Cannot reset corrupted document');
        }
        return;
      }
      
      // Validate content length
      if (yContent.length > MAX_DOC_LENGTH) {
        console.error('[MonacoBinding] Yjs content too large during init:', yContent.length, 'bytes. Resetting.');
        try {
          this.yText.delete(0, this.yText.length);
        } catch {
          console.error('[MonacoBinding] Failed to reset large content');
        }
        return;
      }
      
      const monacoContent = this.model.getValue();

      if (yContent && yContent !== monacoContent) {
        this._muxCounter++;
        try {
          this.model.setValue(yContent);
        } finally {
          this._muxCounter--;
        }
      }
    } catch (error) {
      console.error('[MonacoBinding] Error initializing content:', error);
      // Don't throw - allow editor to work with empty content
    }
  }

  /**
   * Monaco changes → Yjs operations
   */
  private _setupMonacoToYjs() {
    this._modelContentChangedListener = this.model.onDidChangeContent((event) => {
      // STOP ALL PROCESSING if document is corrupted
      if (this._isCorrupted) {
        return;
      }
      
      // Skip if change came from Yjs (counter > 0 means we're applying remote changes)
      if (this._muxCounter > 0) {
        return;
      }

      // Additional safety check: verify the change is actually from user input
      // If the change has no actual modifications, skip it
      const hasRealChanges = event.changes.some(
        (change) => change.text.length > 0 || change.rangeLength > 0
      );
      if (!hasRealChanges) {
        return;
      }

      // Predict resulting length to catch runaway loops early
      const currentLength = this.yText.length;
      let predictedLength = currentLength;
      for (const change of event.changes) {
        predictedLength -= change.rangeLength;
        predictedLength += change.text.length;
      }
      const MAX_DOC_LENGTH = 10 * 1024 * 1024; // 10MB
      if (predictedLength > MAX_DOC_LENGTH) {
        console.error('[MonacoBinding] Predicted document too large from local edit:', predictedLength);
        this._markCorrupted({ message: 'Local edit would exceed size limit', size: predictedLength });
        return;
      }

      try {
        // Log local changes for debugging
        console.log('[MonacoBinding] Sending local changes to Yjs:', event.changes.length, 'changes');
        
        // Use 'this' as origin to mark these changes as coming from Monaco
        // The Yjs observer will skip changes where origin === this
        // This prevents feedback loops (Monaco -> Yjs -> Monaco)
        this.yText.doc?.transact(() => {
          // Apply changes in reverse order (end to start) to maintain correct offsets
          const sortedChanges = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
          
          for (const change of sortedChanges) {
            const offset = change.rangeOffset;
            const deleteLength = change.rangeLength;
            const insertText = change.text;

            // Validate offset is within document bounds
            const currentLength = this.yText.length;
            if (offset > currentLength) {
              console.warn('[MonacoBinding] Offset out of bounds, clamping:', offset, '>', currentLength);
              continue;
            }

            // Apply delete first, then insert (this maintains correct offsets)
            if (deleteLength > 0) {
              const actualDeleteLength = Math.min(deleteLength, currentLength - offset);
              if (actualDeleteLength > 0) {
                this.yText.delete(offset, actualDeleteLength);
              }
            }

            if (insertText.length > 0) {
              this.yText.insert(offset, insertText);
            }
          }
        }, this); // Use 'this' as origin so Yjs observer can skip these changes
        
        console.log('[MonacoBinding] Local changes applied to Yjs, doc length:', this.yText.length);
      } catch (error) {
        console.error('[MonacoBinding] Error applying Monaco changes to Yjs:', error);
      }
    });
  }

  /**
   * Yjs operations → Monaco changes
   *
   * This handles REMOTE changes from other users coming through WebSocket.
   * We apply these changes to Monaco so they appear in the editor.
   */
  private _setupYjsToMonaco() {
    this._textObserver = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      // STOP ALL PROCESSING if document is corrupted
      if (this._isCorrupted) {
        return;
      }

      // Guard against oversized remote payloads (can happen with corrupted IndexedDB or bad peers)
      const MAX_DOC_LENGTH = 10 * 1024 * 1024; // 10MB
      if (this.yText.length > MAX_DOC_LENGTH) {
        console.error('[MonacoBinding] Yjs document exceeded limit during observe:', this.yText.length);
        this._markCorrupted({
          message: 'Document exceeded size limit during observe',
          size: this.yText.length,
        });
        return;
      }

      // Skip changes that originated from THIS MonacoBinding (local user edits)
      // These are already in Monaco, no need to apply them again
      if (transaction.origin === this) {
        return;
      }

      // Skip if we're already applying changes (prevent recursion)
      if (this._muxCounter > 0) {
        return;
      }

      // Apply REMOTE changes (from WebSocket/other users) to Monaco
      // This is what enables collaboration - seeing other users' edits!
      try {
        this._muxCounter++;

        // Save current cursor/selection to restore after applying changes
        const selections = this.editor.getSelections();

        // Apply each delta from Yjs to Monaco
        const edits: Monaco.editor.IIdentifiedSingleEditOperation[] = [];
        let currentOffset = 0;

        // Log remote changes for debugging
        console.log('[MonacoBinding] Applying remote changes:', event.delta.length, 'deltas');

        for (const delta of event.delta) {
          if (delta.retain !== undefined) {
            currentOffset += delta.retain;
          } else if (delta.insert !== undefined) {
            const insertText = typeof delta.insert === 'string' ? delta.insert : '';
            const position = this.model.getPositionAt(currentOffset);
            edits.push({
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
              text: insertText,
            });
            currentOffset += insertText.length;
          } else if (delta.delete !== undefined) {
            const startPosition = this.model.getPositionAt(currentOffset);
            const endPosition = this.model.getPositionAt(currentOffset + delta.delete);
            edits.push({
              range: {
                startLineNumber: startPosition.lineNumber,
                startColumn: startPosition.column,
                endLineNumber: endPosition.lineNumber,
                endColumn: endPosition.column,
              },
              text: '',
            });
          }
        }

        if (edits.length > 0) {
          console.log('[MonacoBinding] Applying', edits.length, 'edits to Monaco');
          // Apply all edits as a single operation
          this.model.pushEditOperations(selections, edits, () => selections);
        }
      } catch (error) {
        console.error('[MonacoBinding] Error applying remote changes:', error);
      } finally {
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
    // Mark as corrupted to stop any pending operations
    this._isCorrupted = true;
    
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
