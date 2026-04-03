import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override';
import getLifecycleServiceOverride from '@codingame/monaco-vscode-lifecycle-service-override';
import getLocalizationServiceOverride from '@codingame/monaco-vscode-localization-service-override';
import { createDefaultLocaleConfiguration } from 'monaco-languageclient/vscodeApiLocales';
import { LogLevel } from '@codingame/monaco-vscode-api';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageclient/browser.js';
import { configureMonacoWorkers } from '../../limboole/langium/utils';
import { createDafnyWebSocketWorker } from './dafnyWebSocketClient';
import dafnyLanguageConfig from './dafny-configuration.json?raw';
import dafnyGrammar from './dafny-grammar.json?raw';
import type { LspConfig } from '@/../tools/common/lspTypes';

// Build WebSocket URL dynamically based on current host
function getDafnyLspUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/lsp-dafny/lsp`;
}

export const createDafnyLspConfig = async (): Promise<LspConfig> => {
    // Load the extension files for Dafny
    const dafnyExtensionFilesOrContents = new Map<string, string | URL>();
    dafnyExtensionFilesOrContents.set(`/dafny-configuration.json`, dafnyLanguageConfig);
    dafnyExtensionFilesOrContents.set(`/dafny-grammar.json`, dafnyGrammar);

    // Create Dafny WebSocket worker with dynamic URL
    const dafnyWorker = createDafnyWebSocketWorker(getDafnyLspUrl());

    // Wait a bit to check if connection fails
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (dafnyWorker.isConnectionFailed()) {
        console.warn('Dafny LSP connection failed, LSP features will not be available');
        dafnyWorker.terminate();
        throw new Error('Dafny LSP connection failed');
    }

    // Create message channel for the worker
    const dafnyChannel = new MessageChannel();
    dafnyWorker.postMessage({ port: dafnyChannel.port2 }, [dafnyChannel.port2]);

    // Create message readers and writers
    const dafnyReader = new BrowserMessageReader(dafnyChannel.port1);
    const dafnyWriter = new BrowserMessageWriter(dafnyChannel.port1);

    return {
        vscodeApiConfig: {
            $type: 'extended',
            viewsConfig: { $type: 'EditorService' },
            logLevel: LogLevel.Debug,
            serviceOverrides: {
                ...getKeybindingsServiceOverride(),
                ...getLifecycleServiceOverride(),
                ...getLocalizationServiceOverride(createDefaultLocaleConfiguration()),
            },
            extensions: [
                {
                    config: {
                        name: 'dafny-example',
                        publisher: 'soaibuzzaman',
                        version: '1.0.0',
                        engines: {
                            vscode: '*',
                        },
                        contributes: {
                            languages: [
                                {
                                    id: 'dafny',
                                    extensions: ['.dfy'],
                                    aliases: ['Dafny', 'dafny'],
                                    configuration: `./dafny-configuration.json`,
                                },
                            ],
                            grammars: [
                                {
                                    language: 'dafny',
                                    scopeName: 'source.dafny',
                                    path: `./dafny-grammar.json`,
                                },
                            ],
                        },
                    },
                    filesOrContents: dafnyExtensionFilesOrContents,
                },
            ],
            userConfiguration: {
                json: JSON.stringify({
                    'workbench.colorTheme': 'Default Light Modern',
                    'editor.guides.bracketPairsHorizontal': 'active',
                    'editor.wordBasedSuggestions': 'off',
                    'editor.experimental.asyncTokenization': true,
                    'editor.semanticHighlighting.enabled': true,
                }),
            },
            monacoWorkerFactory: configureMonacoWorkers,
        },
        editorAppConfig: {
            editorOptions: {
                minimap: {
                    enabled: false,
                },
                automaticLayout: true,
                mouseWheelZoom: true,
                bracketPairColorization: {
                    enabled: true,
                    independentColorPoolPerBracketType: true,
                },
                glyphMargin: true,
                lineNumbers: 'on',
                quickSuggestions: true,
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnCommitCharacter: true,
                acceptSuggestionOnEnter: 'on',
                wordBasedSuggestions: 'off',
                suggest: {
                    showKeywords: true,
                    showSnippets: true,
                    showFunctions: true,
                    showConstructors: true,
                    showFields: true,
                    showVariables: true,
                    showClasses: true,
                    showStructs: true,
                    showInterfaces: true,
                    showModules: true,
                    showProperties: true,
                    showEvents: true,
                    showOperators: true,
                    showUnits: true,
                    showValues: true,
                    showConstants: true,
                    showEnums: true,
                    showEnumMembers: true,
                    showColors: true,
                    showFiles: true,
                    showReferences: true,
                    showFolders: true,
                    showTypeParameters: true,
                },
            },
            codeResources: {
                modified: {
                    text: '',
                    uri: '/workspace/example.dfy',
                },
            },
            useDiffEditor: false,
        },
        languageClientConfig: {
            languageId: 'dafny',
            connection: {
                options: {
                    $type: 'WorkerDirect',
                    worker: dafnyWorker as any,
                    messagePort: dafnyChannel.port1,
                },
                messageTransports: { reader: dafnyReader, writer: dafnyWriter },
            },
            clientOptions: {
                documentSelector: ['dafny'],
            },
        },
    };
};
