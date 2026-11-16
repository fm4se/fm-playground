import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override';
import getLifecycleServiceOverride from '@codingame/monaco-vscode-lifecycle-service-override';
import getLocalizationServiceOverride from '@codingame/monaco-vscode-localization-service-override';
import { createDefaultLocaleConfiguration } from 'monaco-languageclient/vscodeApiLocales';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageclient/browser.js';
import nuXmvLanguageConfig from './language-configuration.json?raw';
import responseNuXmvTm from '../syntaxes/nusmv.tmLanguage.json?raw';
import { configureMonacoWorkers } from '../utils';
import workerPortUrlNuXmv from '../worker/nusmv-server-port?worker&url';
import type { LspConfig } from '@/../tools/common/lspTypes';

const loadLangiumWorkerPort = () => {
    return new Worker(workerPortUrlNuXmv, {
        type: 'module',
        name: 'nuXmv Server Port',
    });
};

export const createLangiumNuXmvConfig = async (): Promise<LspConfig> => {
    const extensionFilesOrContents = new Map<string, string | URL>();
    extensionFilesOrContents.set(`/nuxmv-configuration.json`, nuXmvLanguageConfig);
    extensionFilesOrContents.set(`/nuxmv-grammar.json`, responseNuXmvTm);

    const nuXmvWorkerPort = loadLangiumWorkerPort();

    const channel = new MessageChannel();
    nuXmvWorkerPort.postMessage({ port: channel.port2 }, [channel.port2]);

    const reader = new BrowserMessageReader(channel.port1);
    const writer = new BrowserMessageWriter(channel.port1);

    return {
        vscodeApiConfig: {
            $type: 'extended',
            viewsConfig: { $type: 'EditorService' },
            serviceOverrides: {
                ...getKeybindingsServiceOverride(),
                ...getLifecycleServiceOverride(),
                ...getLocalizationServiceOverride(createDefaultLocaleConfiguration()),
            },
            extensions: [
                {
                    config: {
                        name: 'NuSMV',
                        publisher: 'LiamWalsh98',
                        version: '0.10.0',
                        engines: {
                            vscode: '*',
                        },
                        contributes: {
                            languages: [
                                {
                                    id: 'nusmv',
                                    extensions: ['.smv', ".xmv"],
                                    aliases: ["NuSMV","nuXmv"],
                                    configuration: `./nuxmv-configuration.json`,
                                },
                            ],
                            grammars: [
                                {
                                    language: 'nusmv',
                                    scopeName: 'source.nusmv',
                                    path: `./nuxmv-grammar.json`,
                                },
                            ],
                        },
                    },
                    filesOrContents: extensionFilesOrContents,
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
                glyphMargin: false,
            },
            codeResources: {
                modified: {
                    text: '',
                    uri: '/workspace/example.smv',
                },
            },
            useDiffEditor: false,
        },
        languageClientConfig: {
            languageId: 'nusmv',
            connection: {
                options: {
                    $type: 'WorkerDirect',
                    worker: nuXmvWorkerPort,
                    messagePort: channel.port1,
                },
                messageTransports: { reader, writer },
            },
            clientOptions: {
                documentSelector: ['nusmv'],
            },
        },
    };
};
