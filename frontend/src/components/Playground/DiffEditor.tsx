import { useState, useRef, useEffect } from 'react';
import * as monacoEditor from 'monaco-editor';
import { DiffEditor } from '@monaco-editor/react';
import { useAtom } from 'jotai';
import { editorValueAtom, languageAtom, lineToHighlightAtom } from '@/atoms';
import { fmpConfig, languageConfigMap } from '@/ToolMaps';
import '@/assets/style/Playground.css';
import { useCdnMonacoEnvironment } from './monacoEnvironment';

interface DiffCodeEditorProps {
    height: string;
    editorTheme: string;
    originalValue?: string;
    modifiedValue?: string;
    readOnly?: boolean;
    showDiffActions?: boolean;
    isAnalyzeMode?: boolean;
}

const CodeDiffEditor: React.FC<DiffCodeEditorProps> = (props: DiffCodeEditorProps) => {
    const [editorValue, setEditorValue] = useAtom(editorValueAtom);
    const diffEditorRef = useRef<monacoEditor.editor.IStandaloneDiffEditor | null>(null);
    const [language, setLanguage] = useAtom(languageAtom);
    const [lineToHighlight, setLineToHighlight] = useAtom(lineToHighlightAtom);
    const [decorationIds, setDecorationIds] = useState<string[]>([]);
    const [isMobile, setIsMobile] = useState(false);
    const isSettingValueRef = useRef(false);
    const contentListenerRef = useRef<monacoEditor.IDisposable | null>(null);
    // This editor runs on the CDN Monaco copy; see monacoEnvironment.ts.
    const handleBeforeMount = useCdnMonacoEnvironment();

    // Check screen size on mount and resize for mobile detection
    useEffect(() => {
        const checkScreenSize = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkScreenSize();
        window.addEventListener('resize', checkScreenSize);

        return () => {
            window.removeEventListener('resize', checkScreenSize);
        };
    }, []);

    const syncEditorValue = (editor: monacoEditor.editor.ICodeEditor | undefined, value: string) => {
        if (editor && editor.getModel() && editor.getValue() !== value) {
            isSettingValueRef.current = true;
            try {
                editor.setValue(value);
            } finally {
                isSettingValueRef.current = false;
            }
        }
    };

    /**
     * Sync the original (left) Monaco model when props.originalValue changes.
     */
    useEffect(() => {
        syncEditorValue(diffEditorRef.current?.getOriginalEditor(), props.originalValue ?? '');
    }, [props.originalValue]);

    /**
     * Sync the modified (right) Monaco model when props.modifiedValue or editorValue changes.
     */
    useEffect(() => {
        syncEditorValue(diffEditorRef.current?.getModifiedEditor(), props.modifiedValue ?? editorValue ?? '');
    }, [props.modifiedValue, editorValue]);

    useEffect(() => {
        return () => {
            contentListenerRef.current?.dispose();
            contentListenerRef.current = null;

            // @monaco-editor/react disposes the text models *before* the diff editor widget,
            // which throws "TextModel got disposed before DiffEditorWidget model got reset"
            // (GlitchTip issue 9). It is told to keep the models (keepCurrent*Model below);
            // here they are detached from the widget first and then disposed.
            const diffEditor = diffEditorRef.current;
            diffEditorRef.current = null;
            const models = diffEditor?.getModel();
            try {
                diffEditor?.setModel(null);
            } catch {
                // The widget may already be disposed; the models can still be released.
            }
            models?.original.dispose();
            models?.modified.dispose();
        };
    }, []);

    /**
     * Sets the language when the language prop changes.
     */
    useEffect(() => {
        setLanguage(language);
    }, [language.id]);

    useEffect(() => {
        if (diffEditorRef.current) {
            // Highlight lines in the modified editor (right side - editable by default)
            const modifiedEditor = diffEditorRef.current.getModifiedEditor();
            if (lineToHighlight !== null && lineToHighlight.length > 0 && modifiedEditor) {
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
                const newDecorationIds = modifiedEditor.deltaDecorations(decorationIds, decorations);
                setDecorationIds(newDecorationIds);
            } else if (modifiedEditor) {
                // Remove all decorations
                const newDecorationIds = modifiedEditor.deltaDecorations(decorationIds, []);
                setDecorationIds(newDecorationIds);
            }
        }
    }, [lineToHighlight]);

    // Register the language configuration for each tool
    function handleDiffEditorDidMount(editor: monacoEditor.editor.IStandaloneDiffEditor, monaco: typeof monacoEditor) {
        diffEditorRef.current = editor;
        // Standard Monaco layout: original (left, read-only), modified (right, editable)
        const originalEditor = editor.getOriginalEditor(); // Left side - read-only by default
        const modifiedEditor = editor.getModifiedEditor(); // Right side - editable by default

        // Configure editors with standard roles
        if (originalEditor) {
            originalEditor.updateOptions({ readOnly: true }); // Keep left side read-only
            syncEditorValue(originalEditor, props.originalValue ?? '');
        }

        if (modifiedEditor) {
            modifiedEditor.updateOptions({ readOnly: props.readOnly || false }); // Make right side editable
            syncEditorValue(modifiedEditor, props.modifiedValue ?? editorValue ?? '');
            modifiedEditor.focus();

            // Listen for changes on the modified editor (right side)
            contentListenerRef.current?.dispose();
            contentListenerRef.current = modifiedEditor.onDidChangeModelContent(() => {
                if (isSettingValueRef.current) return;
                const newCode = modifiedEditor.getValue();
                handleCodeChange(newCode);
            });
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
    }

    useEffect(() => {
        if (diffEditorRef.current) {
            handleDiffEditorDidMount(diffEditorRef.current, window.monaco);
        }
    }, [props.editorTheme]);

    const handleCodeChange = (newCode: string | undefined) => {
        if (newCode !== undefined) {
            setEditorValue(newCode);
            setLineToHighlight([]);
        }
    };

    return (
        <div className='custom-diff-editor'>
            <DiffEditor
                height={props.height}
                width='100%'
                language={language.id}
                original={props.originalValue ?? ''}
                modified={props.modifiedValue ?? editorValue ?? ''}
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
                    readOnly: false,
                    renderSideBySide: !isMobile && !props.isAnalyzeMode,
                    enableSplitViewResizing: true,
                    renderOverviewRuler: true,
                    ignoreTrimWhitespace: false,
                }}
                keepCurrentOriginalModel
                keepCurrentModifiedModel
                beforeMount={handleBeforeMount}
                onMount={handleDiffEditorDidMount}
            />
        </div>
    );
};

export default CodeDiffEditor;
