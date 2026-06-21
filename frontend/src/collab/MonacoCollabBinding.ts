/**
 * MonacoCollabBinding — Manual Yjs Y.Text ↔ Monaco ITextModel binding.
 *
 * This replaces the unmaintained y-monaco package by directly observing
 * Y.Text changes and applying them to the Monaco model, and vice versa.
 *
 * It also handles remote cursor/selection decorations via the awareness
 * protocol.
 */
import * as Y from 'yjs';
import type * as monacoEditor from 'monaco-editor';
import type { Awareness } from 'y-protocols/awareness';

/**
 * Convert a Y.Text absolute index to a Monaco {lineNumber, column} position.
 */
function indexToPosition(model: monacoEditor.editor.ITextModel, index: number): monacoEditor.IPosition {
    // Monaco's getPositionAt is 1-based
    return model.getPositionAt(index);
}


export class MonacoCollabBinding {
    private ytext: Y.Text;
    private model: monacoEditor.editor.ITextModel;
    private editor: monacoEditor.editor.IStandaloneCodeEditor;
    private awareness: Awareness | null;
    private monacoModule: typeof monacoEditor;

    private isApplyingYjsChanges = false;
    private isApplyingMonacoChanges = false;

    private ytextObserver: (event: Y.YTextEvent, transaction: Y.Transaction) => void;
    private monacoDisposable: monacoEditor.IDisposable | null = null;
    private cursorDisposable: monacoEditor.IDisposable | null = null;
    private selectionDisposable: monacoEditor.IDisposable | null = null;
    private awarenessHandler: (() => void) | null = null;
    private decorationIds: string[] = [];
    private destroyed = false;

    /**
     * @param ytext - The Y.Text shared type to bind to
     * @param editor - The Monaco standalone editor instance
     * @param model - The Monaco text model
     * @param awareness - Optional awareness instance for cursor sharing
     * @param monacoModule - The monaco-editor module (for Range, etc.)
     */
    constructor(
        ytext: Y.Text,
        editor: monacoEditor.editor.IStandaloneCodeEditor,
        model: monacoEditor.editor.ITextModel,
        awareness: Awareness | null,
        monacoModule: typeof monacoEditor
    ) {
        this.ytext = ytext;
        this.editor = editor;
        this.model = model;
        this.awareness = awareness;
        this.monacoModule = monacoModule;

        // --- Sync initial content ---
        // If Y.Text already has content (we're joining an existing room),
        // replace the Monaco model content with the Y.Text content.
        // If Y.Text is empty (we're creating a new room), the CollabManager
        // already seeded it with the editor content.
        const ytextContent = this.ytext.toString();
        const modelContent = this.model.getValue();
        if (ytextContent && ytextContent !== modelContent) {
            this.isApplyingYjsChanges = true;
            this.model.setValue(ytextContent);
            this.isApplyingYjsChanges = false;
        }

        // --- Y.Text → Monaco ---
        this.ytextObserver = (event: Y.YTextEvent, _transaction: Y.Transaction) => {
            if (this.isApplyingMonacoChanges) return;
            if (this.destroyed) return;

            this.isApplyingYjsChanges = true;
            try {
                const edits: monacoEditor.editor.IIdentifiedSingleEditOperation[] = [];
                let index = 0;

                for (const delta of event.delta) {
                    if (delta.retain != null) {
                        index += delta.retain;
                    } else if (delta.insert != null) {
                        const insertText = typeof delta.insert === 'string' ? delta.insert : '';
                        const position = indexToPosition(this.model, index);
                        const range = new this.monacoModule.Range(
                            position.lineNumber,
                            position.column,
                            position.lineNumber,
                            position.column
                        );
                        edits.push({ range, text: insertText, forceMoveMarkers: true });
                        // index does NOT advance for inserts because Monaco edits are 
                        // applied simultaneously based on the *old* model state.
                    } else if (delta.delete != null) {
                        const startPos = indexToPosition(this.model, index);
                        const endPos = indexToPosition(this.model, index + delta.delete);
                        const range = new this.monacoModule.Range(
                            startPos.lineNumber,
                            startPos.column,
                            endPos.lineNumber,
                            endPos.column
                        );
                        edits.push({ range, text: '', forceMoveMarkers: true });
                        index += delta.delete; // delete advances the cursor in the original document
                    }
                }

                if (edits.length > 0) {
                    this.editor.executeEdits('collab', edits);
                }
            } finally {
                this.isApplyingYjsChanges = false;
            }
        };

        this.ytext.observe(this.ytextObserver);

        // --- Monaco → Y.Text ---
        this.monacoDisposable = this.model.onDidChangeContent((event) => {
            if (this.isApplyingYjsChanges) return;
            if (this.destroyed) return;

            this.isApplyingMonacoChanges = true;
            try {
                this.ytext.doc?.transact(() => {
                    // Process changes in reverse order to maintain correct indices
                    const sortedChanges = [...event.changes]
                        .sort((a, b) => b.rangeOffset - a.rangeOffset);

                    for (const change of sortedChanges) {
                        if (change.rangeLength > 0) {
                            this.ytext.delete(change.rangeOffset, change.rangeLength);
                        }
                        if (change.text) {
                            this.ytext.insert(change.rangeOffset, change.text);
                        }
                    }
                });
            } finally {
                this.isApplyingMonacoChanges = false;
            }
        });

        // --- Cursor/Selection awareness ---
        if (this.awareness) {
            // Send local cursor position
            this.cursorDisposable = this.editor.onDidChangeCursorPosition((e) => {
                if (this.destroyed) return;
                this.awareness?.setLocalStateField('cursor', {
                    lineNumber: e.position.lineNumber,
                    column: e.position.column,
                });
            });

            // Send local selection
            this.selectionDisposable = this.editor.onDidChangeCursorSelection((e) => {
                if (this.destroyed) return;
                const sel = e.selection;
                if (
                    sel.startLineNumber === sel.endLineNumber &&
                    sel.startColumn === sel.endColumn
                ) {
                    this.awareness?.setLocalStateField('selection', null);
                } else {
                    this.awareness?.setLocalStateField('selection', {
                        startLineNumber: sel.startLineNumber,
                        startColumn: sel.startColumn,
                        endLineNumber: sel.endLineNumber,
                        endColumn: sel.endColumn,
                    });
                }
            });

            // Render remote cursors/selections
            this.awarenessHandler = () => {
                if (this.destroyed) return;
                this.renderRemoteCursors();
            };
            this.awareness.on('change', this.awarenessHandler);

            // Initial render
            this.renderRemoteCursors();
        }
    }

    /** Render remote cursor and selection decorations */
    private renderRemoteCursors(): void {
        if (!this.awareness || this.destroyed) return;

        const states = this.awareness.getStates();
        const localClientId = this.awareness.clientID;
        const decorations: monacoEditor.editor.IModelDeltaDecoration[] = [];

        states.forEach((state, clientId) => {
            if (clientId === localClientId) return;
            if (!state.user) return;

            const userName = state.user.name || `User ${clientId}`;

            // Cursor decoration
            if (state.cursor) {
                const { lineNumber, column } = state.cursor;
                // Validate cursor position is within model bounds
                const lineCount = this.model.getLineCount();
                if (lineNumber >= 1 && lineNumber <= lineCount) {
                    const maxColumn = this.model.getLineMaxColumn(lineNumber);
                    const safeColumn = Math.min(column, maxColumn);

                    // Cursor line and name tag (via ::after pseudo-element in injected CSS)
                    decorations.push({
                        range: new this.monacoModule.Range(lineNumber, safeColumn, lineNumber, safeColumn + 1),
                        options: {
                            className: `collab-cursor`,
                            beforeContentClassName: `collab-cursor-line collab-cursor-${clientId}`,
                            stickiness: 1, // NeverGrowsWhenTypingAtEdges
                            hoverMessage: { value: userName },
                        },
                    });
                }
            }

            // Selection decoration
            if (state.selection) {
                const sel = state.selection;
                const lineCount = this.model.getLineCount();
                if (sel.startLineNumber >= 1 && sel.startLineNumber <= lineCount) {
                    decorations.push({
                        range: new this.monacoModule.Range(
                            sel.startLineNumber,
                            sel.startColumn,
                            sel.endLineNumber,
                            sel.endColumn
                        ),
                        options: {
                            className: `collab-selection collab-selection-${clientId}`,
                            stickiness: 1,
                        },
                    });
                }
            }
        });

        // Apply all decorations at once, replacing previous ones
        this.decorationIds = this.editor.deltaDecorations(this.decorationIds, decorations);

        // Inject dynamic CSS for cursor colors
        this.injectCursorStyles();
    }

    /** Inject dynamic CSS styles for remote cursor colors */
    private injectCursorStyles(): void {
        if (!this.awareness) return;

        let styleEl = document.getElementById('collab-cursor-dynamic-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'collab-cursor-dynamic-styles';
            document.head.appendChild(styleEl);
        }

        const states = this.awareness.getStates();
        const localClientId = this.awareness.clientID;
        let css = '';

        states.forEach((state, clientId) => {
            if (clientId === localClientId) return;
            if (!state.user) return;

            const color = state.user.color || '#888888';
            const name = state.user.name || `User ${clientId}`;
            const safeName = name.replace(/['"\\\\]/g, ''); // prevent CSS injection

            css += `
                .collab-cursor-${clientId} { border-left: 2px solid ${color} !important; }
                .collab-cursor-${clientId}::after {
                    content: "${safeName}";
                    position: absolute;
                    top: 100%;
                    left: 0;
                    background-color: ${color};
                    color: white;
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 3px;
                    border-top-left-radius: 0;
                    font-family: 'Inter', 'Segoe UI', sans-serif;
                    font-weight: 600;
                    white-space: nowrap;
                    pointer-events: none;
                    z-index: 50;
                    line-height: 1.2;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    /* Show by default for better collaboration awareness */
                    opacity: 0.9;
                }
                .collab-cursor-${clientId}:hover::after {
                    opacity: 1;
                    z-index: 100;
                }
                .collab-selection-${clientId} { background-color: ${color}33 !important; }
            `;
        });

        // For multiple users, generate per-user styles using nth-child
        // targeting based on decoration order. This is a pragmatic approach.
        // A more robust solution would use Monaco's `createDecorationsCollection`.
        styleEl.textContent = css;
    }

    /** Destroy the binding and clean up all listeners */
    destroy(): void {
        this.destroyed = true;

        // Remove Y.Text observer
        this.ytext.unobserve(this.ytextObserver);

        // Remove Monaco listeners
        this.monacoDisposable?.dispose();
        this.cursorDisposable?.dispose();
        this.selectionDisposable?.dispose();

        // Remove awareness listener
        if (this.awareness && this.awarenessHandler) {
            this.awareness.off('change', this.awarenessHandler);
        }

        // Clear decorations
        if (this.editor && this.decorationIds.length > 0) {
            try {
                this.editor.deltaDecorations(this.decorationIds, []);
            } catch {
                // Editor may already be disposed
            }
        }
        this.decorationIds = [];

        // Remove dynamic styles
        const styleEl = document.getElementById('collab-cursor-dynamic-styles');
        if (styleEl) {
            styleEl.remove();
        }
    }
}
