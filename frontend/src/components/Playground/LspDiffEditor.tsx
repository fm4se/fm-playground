/**
 * Diff view editor running on the same Monaco/VS Code API as the main LSP editor, so it has
 * the same highlighting and theme. With syntax checking on, the modified (right) side also
 * gets language support (syntax errors, completion, hover).
 *
 * Falls back to the CDN-based CodeDiffEditor only when the tool has no language server or
 * the editor itself (VS Code API) fails to start. If just the language server fails, the
 * diff editor stays, without syntax checking.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { LanguageClientWrapper } from 'monaco-languageclient/lcwrapper';
import type { LanguageClientConfig } from 'monaco-languageclient/lcwrapper';
import { EditorApp } from 'monaco-languageclient/editorApp';
import '@codingame/monaco-vscode-theme-defaults-default-extension';
import { editorValueAtom, enableLspAtom, languageAtom, lineToHighlightAtom } from '@/atoms';
import { lspSupportMap } from '@/ToolMaps';
import { reportLspFailure } from '@/monitoring';
import { createDynamicLspConfig } from '@/../tools/common/dynamicLspWrapperConfig';
import type { LspConfig } from '@/../tools/common/lspTypes';
import CodeDiffEditor, { type DiffCodeEditorProps } from './DiffEditor';
import { ensureVscodeApi, LSP_START_TIMEOUT_MS, setEditorDarkTheme, terminateLanguageServerWorker, withTimeout } from './lspRuntime';
import '@/assets/style/Playground.css';

type DiffEditorInstance = NonNullable<ReturnType<EditorApp['getDiffEditor']>>;
type DecorationsCollection = ReturnType<ReturnType<DiffEditorInstance['getModifiedEditor']>['createDecorationsCollection']>;
type Disposable = { dispose(): void };

/** Only the modified side is a language server document; see `restrictToModifiedSide`. */
const MODIFIED_PATTERN = '**/diff/modified.*';

/**
 * The language client normally handles every document of its language. Here it may only
 * handle the modified side: most of the tools' language servers resolve names across all
 * open documents, so the original side (and the main editor's model, which stays alive in
 * the background) would otherwise change the diagnostics shown on the modified side.
 */
function restrictToModifiedSide(config: LanguageClientConfig): LanguageClientConfig {
    const selector = (config.clientOptions?.documentSelector ?? []) as Array<string | Record<string, unknown>>;
    return {
        ...config,
        clientOptions: {
            ...config.clientOptions,
            documentSelector: selector.map((entry) =>
                typeof entry === 'string' ? { language: entry, pattern: MODIFIED_PATTERN } : { ...entry, pattern: MODIFIED_PATTERN }
            ) as NonNullable<LanguageClientConfig['clientOptions']>['documentSelector'],
        },
    };
}

/** File extension of the tool's main document, e.g. '.smt2', so the diff models get the same language. */
function fileExtension(config: LspConfig): string {
    const uri = config.editorAppConfig.codeResources?.modified?.uri ?? '';
    const dot = uri.lastIndexOf('.');
    return dot >= 0 ? uri.slice(dot) : '';
}

const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    useEffect(() => {
        const update = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    return isMobile;
};

type LspDiffEditorProps = DiffCodeEditorProps & { languageFeatures: boolean };

const LspDiffEditorInner: React.FC<LspDiffEditorProps> = ({ languageFeatures, ...props }) => {
    const [editorValue, setEditorValue] = useAtom(editorValueAtom);
    const [language] = useAtom(languageAtom);
    const [lineToHighlight, setLineToHighlight] = useAtom(lineToHighlightAtom);
    const isMobile = useIsMobile();
    const containerRef = useRef<HTMLDivElement>(null);
    const diffEditorRef = useRef<DiffEditorInstance | null>(null);
    const decorationsRef = useRef<DecorationsCollection | null>(null);
    const isSettingValueRef = useRef(false);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    const modifiedText = props.modifiedValue ?? editorValue ?? '';
    const sideBySide = !isMobile && !props.isAnalyzeMode;

    // Values read once at start-up; later changes are applied by the sync effects below.
    const initialRef = useRef({ original: props.originalValue ?? '', modified: modifiedText, sideBySide, readOnly: props.readOnly ?? false });

    useEffect(() => {
        let cancelled = false;
        let lspConfig: LspConfig | null = null;
        let languageClient: LanguageClientWrapper | null = null;
        let editorApp: EditorApp | null = null;
        const disposables: Disposable[] = [];

        const teardown = () => {
            disposables.forEach((d) => d.dispose());
            diffEditorRef.current = null;
            decorationsRef.current = null;
            // Editor first (closes its documents), then the client; `true` terminates the worker.
            editorApp?.dispose().catch(console.error);
            if (languageClient) {
                languageClient.dispose(true).catch(console.error);
            } else if (lspConfig) {
                terminateLanguageServerWorker(lspConfig.languageClientConfig);
            }
            editorApp = null;
            languageClient = null;
        };

        const start = async () => {
            try {
                // No telemetry: editing in the diff view must not count toward, or reset,
                // the main editor's research telemetry episode.
                lspConfig = await createDynamicLspConfig(language.short, { telemetry: false }, 'diff');
                if (cancelled) return teardown();
                if (!lspConfig) {
                    setFailed(true);
                    return;
                }

                await ensureVscodeApi(lspConfig.vscodeApiConfig);
                if (cancelled) return teardown();

                const ext = fileExtension(lspConfig);
                const initial = initialRef.current;
                editorApp = new EditorApp({
                    ...lspConfig.editorAppConfig,
                    useDiffEditor: true,
                    codeResources: {
                        original: { text: initial.original, uri: `/workspace/diff/original${ext}` },
                        modified: { text: initial.modified, uri: `/workspace/diff/modified${ext}` },
                    },
                    diffEditorOptions: {
                        ...lspConfig.editorAppConfig.editorOptions,
                        // Left side: the comparison spec, read-only. Right side: the user's spec.
                        originalEditable: false,
                        readOnly: initial.readOnly,
                        renderSideBySide: initial.sideBySide,
                        enableSplitViewResizing: true,
                        renderOverviewRuler: true,
                        ignoreTrimWhitespace: false,
                    },
                });
                await editorApp.start(containerRef.current!);
                if (cancelled) return teardown();

                const diffEditor = editorApp.getDiffEditor();
                if (!diffEditor) throw new Error('LSP diff editor did not start');
                const modifiedEditor = diffEditor.getModifiedEditor();
                diffEditorRef.current = diffEditor;
                decorationsRef.current = modifiedEditor.createDecorationsCollection();
                disposables.push(
                    modifiedEditor.onDidChangeModelContent(() => {
                        if (isSettingValueRef.current) return;
                        setEditorValue(modifiedEditor.getValue());
                        setLineToHighlight([]);
                    })
                );
                modifiedEditor.focus();
                setReady(true);
            } catch (error) {
                if (cancelled) return teardown();
                console.error('Error initializing LSP diff editor, falling back to basic diff editor:', error);
                reportLspFailure(error, language.short, 'diff');
                teardown();
                setFailed(true);
                return;
            }

            // The editor works; now the language server, if syntax checking is on. If it
            // fails, the diff editor stays usable without syntax checking.
            const clientConfig = lspConfig.languageClientConfig;
            if (!languageFeatures || lspConfig.languageServerError) {
                terminateLanguageServerWorker(clientConfig);
                if (languageFeatures && lspConfig.languageServerError) {
                    reportLspFailure(lspConfig.languageServerError, language.short, 'diff');
                }
                return;
            }
            languageClient = new LanguageClientWrapper(restrictToModifiedSide(clientConfig));
            try {
                await withTimeout(languageClient.start(), LSP_START_TIMEOUT_MS, 'Starting the language client');
                if (cancelled) return teardown();
            } catch (error) {
                if (cancelled) return teardown();
                console.error('Language server failed to start in the diff view; continuing without syntax checking:', error);
                reportLspFailure(error, language.short, 'diff');
                const failedClient = languageClient;
                languageClient = null;
                failedClient.dispose(true).catch(() => {});
            }
        };

        start();
        return () => {
            cancelled = true;
            teardown();
        };
        // Language changes remount this component (see the `key` below).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep the original (left) side in sync, e.g. after "Load Spec".
    useEffect(() => {
        const original = diffEditorRef.current?.getOriginalEditor();
        const value = props.originalValue ?? '';
        if (original && original.getValue() !== value) original.setValue(value);
    }, [ready, props.originalValue]);

    // Keep the modified (right) side in sync with the shared editor value.
    useEffect(() => {
        const modified = diffEditorRef.current?.getModifiedEditor();
        if (modified && modified.getValue() !== modifiedText) {
            isSettingValueRef.current = true;
            try {
                modified.setValue(modifiedText);
            } finally {
                isSettingValueRef.current = false;
            }
        }
    }, [ready, modifiedText]);

    useEffect(() => {
        diffEditorRef.current?.updateOptions({ renderSideBySide: sideBySide });
    }, [ready, sideBySide]);

    useEffect(() => {
        diffEditorRef.current?.getModifiedEditor().updateOptions({ readOnly: props.readOnly ?? false });
    }, [ready, props.readOnly]);

    // Colour theme follows the app's dark mode (shared with the main editor).
    useEffect(() => {
        setEditorDarkTheme(props.editorTheme === 'vs-dark');
    }, [props.editorTheme]);

    // Line highlights (e.g. from a run) on the modified side.
    useEffect(() => {
        decorationsRef.current?.set(
            (lineToHighlight ?? []).map((line) => ({
                range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
                options: { isWholeLine: true, className: 'lineHighlight', glyphMarginClassName: 'lineHighlightGlyph' },
            }))
        );
    }, [ready, lineToHighlight]);

    if (failed) {
        return <CodeDiffEditor {...props} />;
    }
    return <div ref={containerRef} className='custom-diff-editor' style={{ height: props.height }} />;
};

/**
 * Uses the VS Code-based diff editor for tools with a language server; syntax checking only
 * decides whether it gets a language client. Other tools use the CDN-based diff editor.
 */
const DiffCodeEditor: React.FC<DiffCodeEditorProps> = (props) => {
    const [enableLsp] = useAtom(enableLspAtom);
    const [language] = useAtom(languageAtom);
    if (lspSupportMap[language.short]) {
        return <LspDiffEditorInner key={`${language.short}-${enableLsp}`} languageFeatures={enableLsp} {...props} />;
    }
    return <CodeDiffEditor {...props} />;
};

export default DiffCodeEditor;
