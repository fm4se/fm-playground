import { useState, useRef, useEffect } from 'react';
import * as monacoEditor from 'monaco-editor';
import Editor from '@monaco-editor/react';
import { useAtom } from 'jotai';
import {
    editorValueAtom,
    languageAtom,
    lineToHighlightAtom,
    greenHighlightAtom,
    cursorLineAtom,
    cursorColumnAtom,
    selectedTextAtom,
    selectionRangeAtom,
    targetAssertionRangeAtom,
    minimalSetRangesAtom,
    jotaiStore,
} from '@/atoms';
import { fmpConfig, languageConfigMap } from '@/ToolMaps';
import { alloyRedundancyResultsAtom, alloyExplainResultsAtom, triggerAlloyCodeLensUpdate, isCodeLensEdit } from '@/../tools/alloy/features';
import '@/assets/style/Playground.css';

interface BasicCodeEditorProps {
    height: string;
    editorTheme: string;
    /** Optional callback fired when the editor instance is ready */
    onEditorReady?: (editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: typeof monacoEditor) => void;
    onRunShortcut?: () => void;
}

const CodeEditor: React.FC<BasicCodeEditorProps> = (props: BasicCodeEditorProps) => {
    const [editorValue, setEditorValue] = useAtom(editorValueAtom);
    const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null); // editor reference
    const [language, setLanguage] = useAtom(languageAtom);
    const [lineToHighlight, setLineToHighlight] = useAtom(lineToHighlightAtom);
    const [greenHighlight, setGreenHighlight] = useAtom(greenHighlightAtom);
    const [, setCursorLine] = useAtom(cursorLineAtom);
    const [, setCursorColumn] = useAtom(cursorColumnAtom);
    const [, setSelectedText] = useAtom(selectedTextAtom);
    const [, setSelectionRange] = useAtom(selectionRangeAtom);
    const [targetAssertionRange] = useAtom(targetAssertionRangeAtom);
    const [minimalSetRanges] = useAtom(minimalSetRangesAtom);
    const [decorationIds, setDecorationIds] = useState<string[]>([]);
    const [greenDecorationIds, setGreenDecorationIds] = useState<string[]>([]);
    const [rangeDecorationIds, setRangeDecorationIds] = useState<string[]>([]);
    const onRunShortcutRef = useRef(props.onRunShortcut);
    const shortcutDisposablesRef = useRef<any[]>([]);

    useEffect(() => {
        onRunShortcutRef.current = props.onRunShortcut;
    }, [props.onRunShortcut]);

    useEffect(() => {
        return () => {
            shortcutDisposablesRef.current.forEach((d) => {
                if (d && typeof d.dispose === 'function') d.dispose();
            });
        };
    }, []);

    /**
     * Sets the editor value when the editorValue prop changes.
     */
    useEffect(() => {
        setEditorValue(editorValue);
    }, [editorValue]);

    /**
     * Sets the language when the language prop changes.
     */
    useEffect(() => {
        setLanguage(language);
    }, [language.id]);

    useEffect(() => {
        if (editorRef.current) {
            const editor = editorRef.current;
            if (lineToHighlight !== null && lineToHighlight.length > 0) {
                const decorations = lineToHighlight.map((line) => {
                    return {
                        range: new window.monaco.Range(line, 1, line, 1),
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
    }, [lineToHighlight]);

    // Green highlighting for explain redundancy
    useEffect(() => {
        if (editorRef.current) {
            const editor = editorRef.current;
            if (greenHighlight !== null && greenHighlight.length > 0) {
                const decorations = greenHighlight.map((line) => {
                    return {
                        range: new window.monaco.Range(line, 1, line, 1),
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
                    range: new window.monaco.Range(
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
                        range: new window.monaco.Range(
                            range.startLine,
                            range.startColumn,
                            range.endLine,
                            range.endColumn
                        ),
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

    // Register the language configuration for each tool
    function handleEditorDidMount(editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: typeof monacoEditor) {
        editorRef.current = editor;
        editorRef.current.focus();

        // Track cursor position changes
        editor.onDidChangeCursorPosition((e) => {
            const lineNumber = e.position.lineNumber;
            const column = e.position.column;
            setCursorLine(lineNumber);
            setCursorColumn(column);
        });

        // Track selection changes
        editor.onDidChangeCursorSelection((e) => {
            const model = editor.getModel();
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

        // Initialize cursor position
        const currentPosition = editor.getPosition();
        if (currentPosition) {
            setCursorLine(currentPosition.lineNumber);
            setCursorColumn(currentPosition.column);
        }

        const tools: { [key: string]: { name: string; extension: string; shortName: string } } = fmpConfig.tools;
        for (const toolKey in tools) {
            const tool = tools[toolKey as keyof typeof tools];
            const languageId = tool.extension.replace(/^\./, '');
            const resource = languageConfigMap[languageId];
            if (!resource) {
                console.warn(`Language configuration for ${languageId} not found.`);
                continue;
            }
            const { tokenProvider, configuration } = resource;
            monaco.languages.register({ id: languageId });
            monaco.languages.setMonarchTokensProvider(languageId, tokenProvider);
            monaco.languages.setLanguageConfiguration(languageId, configuration);
        }

        monaco.editor.defineTheme('spectraTheme', {
            base: props.editorTheme === 'vs-dark' ? 'vs-dark' : 'vs', // 'vs-dark' or 'vs'
            inherit: true, // inherit the base theme
            rules: [
                { token: 'system', foreground: '189BCC', fontStyle: 'bold' },
                { token: 'environment', foreground: '0CD806', fontStyle: 'bold' },
                { token: 'reg', foreground: 'FF00FF' },
            ],
            colors: {},
        });

        monaco.editor.setTheme('spectraTheme');

        // Clean up previous shortcut bindings if any
        shortcutDisposablesRef.current.forEach((d) => {
            if (d && typeof d.dispose === 'function') d.dispose();
        });
        shortcutDisposablesRef.current = [];

        const cmdDisposable = editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            onRunShortcutRef.current?.();
        });
        const keyDisposable = editor.onKeyDown((e) => {
            if ((e.ctrlKey || e.metaKey) && (e.keyCode === monaco.KeyCode.KeyS || e.browserEvent?.key === 's' || e.browserEvent?.key === 'S')) {
                e.preventDefault();
                e.stopPropagation();
                onRunShortcutRef.current?.();
            }
        });
        if (cmdDisposable) shortcutDisposablesRef.current.push(cmdDisposable);
        if (keyDisposable) shortcutDisposablesRef.current.push(keyDisposable);

        // Notify parent that the editor is ready (used for collab binding)
        props.onEditorReady?.(editor, monaco);
    }

    useEffect(() => {
        if (editorRef.current) {
            handleEditorDidMount(editorRef.current, window.monaco);
        }
    }, [props.editorTheme]);

    const handleCodeChange = (newCode: string | undefined) => {
        if (newCode !== undefined) {
            setEditorValue(newCode);
            if (!isCodeLensEdit) {
                setLineToHighlight([]);
                setGreenHighlight([]);
                // Clear range-based highlights
                jotaiStore.set(targetAssertionRangeAtom, null);
                jotaiStore.set(minimalSetRangesAtom, []);
                jotaiStore.set(alloyRedundancyResultsAtom, null);
                jotaiStore.set(alloyExplainResultsAtom, null);
                triggerAlloyCodeLensUpdate();
            }
        }
    };

    return (
        <div className='custom-code-editor'>
            <Editor
                height={props.height}
                width='100%'
                language={language.id}
                defaultValue=''
                value={editorValue}
                theme={props.editorTheme}
                options={{
                    minimap: {
                        enabled: false,
                    },
                    automaticLayout: true,
                    mouseWheelZoom: true,
                    bracketPairColorization: {
                        enabled: true,
                        independentColorPoolPerBracketType: true,
                    },
                }}
                onMount={handleEditorDidMount}
                onChange={handleCodeChange}
            />
        </div>
    );
};

export default CodeEditor;

