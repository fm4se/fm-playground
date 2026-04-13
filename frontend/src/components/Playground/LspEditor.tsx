import React, { useEffect, useRef, useState } from 'react';
import { MonacoVscodeApiWrapper } from 'monaco-languageclient/vscodeApiWrapper';
import { LanguageClientWrapper } from 'monaco-languageclient/lcwrapper';
import { EditorApp } from 'monaco-languageclient/editorApp';
import { registerExtension, ExtensionHostKind } from '@codingame/monaco-vscode-api/extensions';
import { encodeStringOrUrlToDataUrl } from 'monaco-languageclient/common';
import { createDynamicLspConfig } from '@/../tools/common/dynamicLspWrapperConfig';
import '../../assets/style/Playground.css';
import '@codingame/monaco-vscode-theme-defaults-default-extension';
import type { LanguageProps } from './Tools';
import * as monaco from 'monaco-editor';
import { useAtom } from 'jotai';
import {
    editorValueAtom,
    cursorLineAtom,
    cursorColumnAtom,
    greenHighlightAtom,
    selectedTextAtom,
    selectionRangeAtom,
    targetAssertionRangeAtom,
    minimalSetRangesAtom,
    jotaiStore,
} from '@/atoms';
import Editor from './Editor'; // Fallback editor

type LspEditorProps = {
    height: string;
    setEditorValue: (value: string) => void;
    editorValue: string;
    language: LanguageProps;
    setLanguage?: (value: string) => void;
    lineToHighlight: number[];
    setLineToHighlight: (line: number[]) => void;
    editorTheme?: string;
};

// Global instances for v10 API
let apiWrapper: MonacoVscodeApiWrapper | null = null;
let apiStarted = false;
let lcWrapperInstance: LanguageClientWrapper | null = null;
let editorAppInstance: EditorApp | null = null;
const registeredExtensions = new Set<string>();

const LspEditor: React.FC<LspEditorProps> = (props) => {
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const prevLanguageRef = useRef<LanguageProps | null>(null);
    const isInitializedRef = useRef<boolean>(false);
    const [lspFailed, setLspFailed] = useState<boolean>(false); // Track LSP initialization failure
    const cursorListenerRef = useRef<any>(null); // Store cursor listener disposable
    const [decorationIds, setDecorationIds] = useState<string[]>([]);
    const [greenDecorationIds, setGreenDecorationIds] = useState<string[]>([]);
    const [rangeDecorationIds, setRangeDecorationIds] = useState<string[]>([]);
    const [greenHighlight, setGreenHighlight] = useAtom(greenHighlightAtom);
    const [, setCursorLine] = useAtom(cursorLineAtom);
    const [, setCursorColumn] = useAtom(cursorColumnAtom);
    const [, setSelectedText] = useAtom(selectedTextAtom);
    const [, setSelectionRange] = useAtom(selectionRangeAtom);
    const [targetAssertionRange] = useAtom(targetAssertionRangeAtom);
    const [minimalSetRanges] = useAtom(minimalSetRangesAtom);

    const handleCodeChange = (value: string) => {
        props.setEditorValue(value);
        props.setLineToHighlight([]);
        setGreenHighlight([]);
        // Clear range-based highlights
        jotaiStore.set(targetAssertionRangeAtom, null);
        jotaiStore.set(minimalSetRangesAtom, []);
    };

    useEffect(() => {
        // Don't initialize if language is not set yet
        if (!props.language?.id) {
            return;
        }

        // Cancellation flag: set to true when cleanup runs so stale async
        // initializations bail out instead of completing on a stale language.
        let cancelled = false;

        const startEditor = async () => {
            // Abort if container not available
            if (!containerRef.current) {
                return;
            }

            // Dispose existing instances
            if (lcWrapperInstance) {
                await lcWrapperInstance.dispose();
                lcWrapperInstance = null;
            }
            if (cancelled) return;

            if (editorAppInstance?.isStarted()) {
                await editorAppInstance.dispose();
                editorAppInstance = null;
            }
            if (cancelled) return;

            isInitializedRef.current = false;

            try {
                const lspConfig = await createDynamicLspConfig(props.language.short);

                if (cancelled) return;

                if (!lspConfig) {
                    console.warn(`LSP not available for ${props.language.short}, falling back to basic editor`);
                    setLspFailed(true);
                    return;
                }

                // Reset lspFailed so the container div becomes visible
                // before Monaco tries to render into it.
                setLspFailed(false);

                // Initialize vscode API (only once globally)
                if (!apiStarted) {
                    apiWrapper = new MonacoVscodeApiWrapper(lspConfig.vscodeApiConfig);
                    await apiWrapper.start();
                    if (cancelled) return;
                    apiStarted = true;
                    // Track extensions registered during first start
                    for (const ext of lspConfig.vscodeApiConfig.extensions ?? []) {
                        const extId = `${ext.config.publisher}.${ext.config.name}`;
                        registeredExtensions.add(extId);
                    }
                } else {
                    // Register new language extensions dynamically for subsequent switches
                    for (const ext of lspConfig.vscodeApiConfig.extensions ?? []) {
                        const extId = `${ext.config.publisher}.${ext.config.name}`;
                        if (!registeredExtensions.has(extId)) {
                            const result = registerExtension(ext.config, ExtensionHostKind.LocalProcess);
                            if (ext.filesOrContents) {
                                for (const [path, content] of ext.filesOrContents) {
                                    (result as any).registerFileUrl(path, encodeStringOrUrlToDataUrl(content));
                                }
                            }
                            await result.whenReady();
                            if (cancelled) return;
                            registeredExtensions.add(extId);
                        }
                    }
                }

                // Create and start language client
                lcWrapperInstance = new LanguageClientWrapper(lspConfig.languageClientConfig);
                await lcWrapperInstance.start();
                if (cancelled) return;

                // Create and start editor app
                editorAppInstance = new EditorApp(lspConfig.editorAppConfig);
                await editorAppInstance.start(containerRef.current);

                // If cancelled after start, tear down immediately and bail out
                if (cancelled) {
                    editorAppInstance.dispose().catch(console.error);
                    editorAppInstance = null;
                    return;
                }

                editorRef.current = editorAppInstance.getEditor();
                setLspFailed(false);

                // Dispose old cursor listener if exists
                if (cursorListenerRef.current) {
                    cursorListenerRef.current.dispose();
                }

                // Track cursor position changes
                cursorListenerRef.current = editorRef.current!.onDidChangeCursorPosition((e: any) => {
                    const lineNumber = e.position.lineNumber;
                    const column = e.position.column;
                    setCursorLine(lineNumber);
                    setCursorColumn(column);
                });

                // Track selection changes
                editorRef.current!.onDidChangeCursorSelection((e: any) => {
                    const model = editorRef.current!.getModel();
                    if (model) {
                        const selection = e.selection;
                        const selectedText = model.getValueInRange(selection);
                        setSelectedText(selectedText);

                        // Store the selection range
                        setSelectionRange({
                            startLine: selection.startLineNumber,
                            startColumn: selection.startColumn,
                            endLine: selection.endLineNumber,
                            endColumn: selection.endColumn,
                        });
                    }
                });

                editorRef.current!.onDidChangeModelContent(() => {
                    handleCodeChange(editorRef.current!.getValue());
                });

                const currentValue = jotaiStore.get(editorValueAtom) || props.editorValue;
                editorRef.current!.setValue(currentValue);

                // Initialize cursor position AFTER setting value (setValue resets cursor to line 1)
                const currentPosition = editorRef.current!.getPosition();
                if (currentPosition) {
                    setCursorLine(currentPosition.lineNumber);
                }

                isInitializedRef.current = true;
                prevLanguageRef.current = props.language;
            } catch (error) {
                if (cancelled) return;
                console.error('Error initializing LSP editor, falling back to basic editor:', error);
                setLspFailed(true);
                // Clean up failed language client
                if (lcWrapperInstance) {
                    await lcWrapperInstance.dispose();
                    lcWrapperInstance = null;
                }
                // We do not dispose editorAppInstance here — it preserves the
                // global monaco-vscode-api state. It will be properly
                // disposed on the next startEditor call.
                isInitializedRef.current = false;
            }
        };

        startEditor();

        return () => {
            // Signal any in-progress async initialization to abort
            cancelled = true;

            // Clean up cursor listener
            if (cursorListenerRef.current) {
                cursorListenerRef.current.dispose();
                cursorListenerRef.current = null;
            }

            // Only dispose the language client on unmount/language change.
            const lc = lcWrapperInstance;
            lcWrapperInstance = null;
            isInitializedRef.current = false;

            lc?.dispose().catch(console.error);
        };
    }, [props.language?.id]); // Only depend on language ID for initialization
    useEffect(() => {
        if (isInitializedRef.current && editorRef.current) {
            setEditorValue(props.editorValue);
        }
    }, [props.editorValue]);

    // Line highlighting effect - similar to Editor.tsx
    useEffect(() => {
        if (editorRef.current) {
            const editor = editorRef.current;
            if (props.lineToHighlight !== null && props.lineToHighlight.length > 0) {
                const decorations = props.lineToHighlight.map((line) => {
                    return {
                        range: new monaco.Range(line, 1, line, 1),
                        options: {
                            isWholeLine: true,
                            className: 'lineHighlight',
                            glyphMarginClassName: 'lineHighlightGlyph',
                        },
                    };
                });
                const newDecorationIds = editor.deltaDecorations(decorationIds, decorations);
                setDecorationIds(newDecorationIds);
            } else {
                // Remove all decorations
                const newDecorationIds = editor.deltaDecorations(decorationIds, []);
                setDecorationIds(newDecorationIds);
            }
        }
    }, [props.lineToHighlight]);

    // Green highlighting for explain redundancy
    useEffect(() => {
        if (editorRef.current) {
            const editor = editorRef.current;
            if (greenHighlight !== null && greenHighlight.length > 0) {
                const decorations = greenHighlight.map((line) => {
                    return {
                        range: new monaco.Range(line, 1, line, 1),
                        options: {
                            isWholeLine: true,
                            className: 'lineHighlightGreen',
                            glyphMarginClassName: 'lineHighlightGlyphGreen',
                        },
                    };
                });
                const newGreenDecorationIds = editor.deltaDecorations(greenDecorationIds, decorations);
                setGreenDecorationIds(newGreenDecorationIds);
            } else {
                // Remove all green decorations
                const newGreenDecorationIds = editor.deltaDecorations(greenDecorationIds, []);
                setGreenDecorationIds(newGreenDecorationIds);
            }
        }
    }, [greenHighlight]);

    // Range-based highlighting for precise assertion ranges
    useEffect(() => {
        if (editorRef.current) {
            const editor = editorRef.current;
            const decorations: any[] = [];

            // Add target assertion range decoration (yellow)
            if (targetAssertionRange) {
                decorations.push({
                    range: new monaco.Range(
                        targetAssertionRange.startLine,
                        targetAssertionRange.startColumn,
                        targetAssertionRange.endLine,
                        targetAssertionRange.endColumn
                    ),
                    options: {
                        inlineClassName: 'inlineHighlightYellow',
                        className: 'rangeHighlightYellow',
                    },
                });
            }

            // Add minimal set ranges decorations (green)
            if (minimalSetRanges && minimalSetRanges.length > 0) {
                minimalSetRanges.forEach((range) => {
                    decorations.push({
                        range: new monaco.Range(range.startLine, range.startColumn, range.endLine, range.endColumn),
                        options: {
                            inlineClassName: 'inlineHighlightGreen',
                            className: 'rangeHighlightGreen',
                        },
                    });
                });
            }

            const newRangeDecorationIds = editor.deltaDecorations(rangeDecorationIds, decorations);
            setRangeDecorationIds(newRangeDecorationIds);
        }
    }, [targetAssertionRange, minimalSetRanges]);

    const setEditorValue = (value: string) => {
        if (editorRef.current) {
            const currentValue = editorRef.current.getValue();
            if (currentValue !== value) {
                const selection = editorRef.current.getSelection();
                editorRef.current.setValue(value);
                if (selection) {
                    editorRef.current.setSelection(selection);
                }
            }
        }
    };

    // Always keep the container div in the DOM so containerRef stays valid.
    // When LSP fails, show the fallback editor on top while keeping
    // the container available for future re-initialization attempts.
    return (
        <div className='custom-code-editor'>
            <div
                ref={containerRef}
                id='monaco-editor-root'
                style={{ height: props.height, display: lspFailed ? 'none' : undefined }}
            />
            {lspFailed && <Editor height={props.height} editorTheme={props.editorTheme || 'vs-dark'} />}
        </div>
    );
};

export default LspEditor;
