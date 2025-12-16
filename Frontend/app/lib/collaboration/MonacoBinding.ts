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

      try {
        // Use transact with 'this' as origin to mark these changes as coming from Monaco
        // This ensures the Yjs observer can skip them
        // CRITICAL: Use a unique origin object to prevent WebSocket from sending these back
        const monacoOrigin = { _monacoBinding: this, _isLocalEdit: true };
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
        }, monacoOrigin); // Unique origin marks these as local Monaco edits
      } catch (error) {
        console.error('[MonacoBinding] Error applying Monaco changes to Yjs:', error);
      }
    });
  }

  /**
   * Yjs operations → Monaco changes
   */
  private _setupYjsToMonaco() {
    this._textObserver = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      // STOP ALL PROCESSING if document is corrupted
      if (this._isCorrupted) {
        return;
      }

      // CRITICAL: ONLY process updates that came from local user edits
      // Skip ALL other origins to prevent echo loops
      
      // Skip if change originated from this binding (we already applied it)
      if (transaction.origin === this) {
        return;
      }

      // Skip if origin is null/undefined (happens during sync or unknown sources)
      if (!transaction.origin) {
        return;
      }

      // ONLY process updates that have the _isLocalEdit flag
      // This ensures we ONLY apply local user edits, NOT server echoes
      if (typeof transaction.origin === 'object' && (transaction.origin as any)._isLocalEdit) {
        // This is a local edit - process it
        // Continue below
      } else {
        // This is from server/WebSocket - IGNORE IT completely
        return;
      }

      // Increment counter to prevent feedback loop
      this._muxCounter++;

      // Temporarily disable Monaco listener to prevent feedback loop
      const wasListenerActive = this._modelContentChangedListener !== null;
      if (wasListenerActive) {
        this._modelContentChangedListener?.dispose();
        this._modelContentChangedListener = null;
      }

      // Save cursor/selection position
      const selections = this.editor.getSelections();
      const viewState = this.editor.saveViewState();

      try {
        // Safety check: Validate Yjs document size before processing
        let yContentLength: number;
        try {
          yContentLength = this.yText.length;
        } catch (e) {
          console.error('[MonacoBinding] Cannot get Yjs text length - document may be corrupted:', e);
          // Restore listener before returning
          if (wasListenerActive && !this._isCorrupted) {
            this._setupMonacoToYjs();
          }
          this._muxCounter--;
          return;
        }
        
        // Prevent processing if document is too large (safety limit: ~10MB for safety)
        const MAX_DOC_LENGTH = 10 * 1024 * 1024; // 10MB (reduced from 100MB for safety)
        if (yContentLength > MAX_DOC_LENGTH) {
          console.error('[MonacoBinding] Yjs document too large:', yContentLength, 'bytes. Document corrupted - DESTROYING binding.');
          
          // Mark as corrupted to stop ALL future processing
          this._isCorrupted = true;
          
          // Remove all listeners immediately
          this._modelContentChangedListener?.dispose();
          this._modelContentChangedListener = null;
          
          if (this._textObserver) {
            this.yText.unobserve(this._textObserver);
            this._textObserver = null;
          }
          
          // Emit corruption event so parent can recreate everything
          this.dispatchEvent(new CustomEvent('corruption-detected', { 
            detail: { 
              size: yContentLength,
              message: 'Document exceeded size limit and was corrupted'
            } 
          }));
          
          this._muxCounter--;
          return;
        }
        
        // Get current document length to validate offsets
        const docLength = this.model.getValueLength();
        
        // Validate delta array exists and is reasonable
        if (!event.delta || !Array.isArray(event.delta)) {
          console.warn('[MonacoBinding] Invalid delta array:', event.delta);
          // Restore listener before returning
          if (wasListenerActive && !this._isCorrupted) {
            this._setupMonacoToYjs();
          }
          this._muxCounter--;
          return;
        }
        
        // Limit delta operations to prevent processing huge deltas
        if (event.delta.length > 10000) {
          console.warn('[MonacoBinding] Delta array too large:', event.delta.length, 'operations. Skipping.');
          // Restore listener before returning
          if (wasListenerActive && !this._isCorrupted) {
            this._setupMonacoToYjs();
          }
          this._muxCounter--;
          return;
        }
        
        // Collect ALL edits first, then apply them in a SINGLE batch operation
        // This prevents multiple change events from triggering feedback loops
        const edits: Array<{
          range: {
            startLineNumber: number;
            startColumn: number;
            endLineNumber: number;
            endColumn: number;
          };
          text: string;
        }> = [];

        // Track cumulative offset as we process deltas
        let currentOffset = 0;

        // First pass: collect all edits
        for (const delta of event.delta) {
          if (delta.retain !== undefined) {
            // Skip forward in the document
            currentOffset += delta.retain;
            // Validate offset doesn't exceed document length
            if (currentOffset > docLength) {
              console.warn('[MonacoBinding] Retain offset exceeds document length:', currentOffset, '>', docLength);
              currentOffset = docLength;
            }
          } else if (delta.insert !== undefined) {
            const insertText = delta.insert as string;
            
            // Validate offset before getting position
            if (currentOffset > docLength) {
              console.warn('[MonacoBinding] Insert offset exceeds document length, clamping:', currentOffset, '>', docLength);
              currentOffset = docLength;
            }
            
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

            // Update offset to account for the insertion
            currentOffset += insertText.length;
          } else if (delta.delete !== undefined) {
            const deleteLength = delta.delete as number;
            
            // Validate offset before getting position
            if (currentOffset > docLength) {
              console.warn('[MonacoBinding] Delete offset exceeds document length, clamping:', currentOffset, '>', docLength);
              currentOffset = docLength;
            }
            
            // Clamp delete length to available content
            const maxDelete = docLength - currentOffset;
            const actualDeleteLength = Math.min(deleteLength, maxDelete);
            
            if (actualDeleteLength > 0) {
              const start = this.model.getPositionAt(currentOffset);
              const end = this.model.getPositionAt(currentOffset + actualDeleteLength);
              
              edits.push({
                range: {
                  startLineNumber: start.lineNumber,
                  startColumn: start.column,
                  endLineNumber: end.lineNumber,
                  endColumn: end.column,
                },
                text: '',
              });
            }
            // Don't update offset for deletes - the content is removed
          }
        }

        // Apply ALL edits in a SINGLE batch operation
        if (edits.length > 0) {
          try {
            // Use pushEditOperations to apply all edits at once
            // This ensures only ONE change event is fired
            this.model.pushEditOperations(
              [],
              edits,
              () => null // No undo/redo support needed for remote changes
            );
          } catch (editError) {
            console.error('[MonacoBinding] Error applying batch edits:', editError);
            // Fallback: apply edits one by one if batch fails
            // But this should rarely happen
            for (const edit of edits) {
              try {
                this.model.applyEdits([edit]);
              } catch (singleEditError) {
                console.error('[MonacoBinding] Error applying single edit:', singleEditError);
              }
            }
          }
        }

        // Restore cursor/selection if possible
        if (viewState) {
          this.editor.restoreViewState(viewState);
        }
        if (selections) {
          this.editor.setSelections(selections);
        }
      } catch (error) {
        console.error('[MonacoBinding] Error applying Yjs delta:', error);
        // If there's a sync error, try to resync by setting Monaco to match Yjs
        // But only if Yjs document is not corrupted
        try {
          // Check Yjs document size first
          const yLength = this.yText.length;
          const MAX_DOC_LENGTH = 100 * 1024 * 1024; // 100MB
          
          if (yLength > MAX_DOC_LENGTH) {
            console.error('[MonacoBinding] Cannot resync - Yjs document too large:', yLength);
            return;
          }
          
          // Safely get Yjs content
          let yContent: string;
          try {
            yContent = this.yText.toString();
          } catch (toStringError) {
            console.error('[MonacoBinding] Cannot convert Yjs to string - document corrupted:', toStringError);
            return;
          }
          
          // Validate content length
          if (yContent.length > MAX_DOC_LENGTH) {
            console.error('[MonacoBinding] Cannot resync - content too large:', yContent.length);
            return;
          }
          
          const monacoContent = this.model.getValue();
          if (yContent !== monacoContent) {
            console.warn('[MonacoBinding] Resyncing Monaco model with Yjs content due to error');
            this._muxCounter++;
            this.model.setValue(yContent);
            this._muxCounter--;
          }
        } catch (resyncError) {
          console.error('[MonacoBinding] Failed to resync after error:', resyncError);
        }
      } finally {
        // Always restore listener and decrement counter
        if (wasListenerActive && !this._isCorrupted) {
          this._setupMonacoToYjs();
        }
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
