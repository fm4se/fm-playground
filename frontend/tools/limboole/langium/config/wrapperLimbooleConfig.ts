import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override';
import getLifecycleServiceOverride from '@codingame/monaco-vscode-lifecycle-service-override';
import getLocalizationServiceOverride from '@codingame/monaco-vscode-localization-service-override';
import { createDefaultLocaleConfiguration } from 'monaco-languageclient/vscodeApiLocales';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageclient/browser.js';
import limbooleLanguageConfig from './language-configuration.json?raw';
import responseLimbooleTm from '../syntaxes/limboole.tmLanguage.json?raw';
import { configureMonacoWorkers } from '../utils';
import workerPortUrlLimboole from '../worker/limboole-server-port?worker&url';
import type { LspConfig } from '@/../tools/common/lspTypes';

const loadLangiumWorkerPort = () => {
    return new Worker(workerPortUrlLimboole, {
        type: 'module',
        name: 'Limboole Server Port',
    });
};

export const createLangiumLimbooleConfig = async (): Promise<LspConfig> => {
    const extensionFilesOrContents = new Map<string, string | URL>();
    extensionFilesOrContents.set(`/limboole-configuration.json`, limbooleLanguageConfig);
    extensionFilesOrContents.set(`/limboole-grammar.json`, responseLimbooleTm);

    const limbooleWorkerPort = loadLangiumWorkerPort();
    const channel = new MessageChannel();
    limbooleWorkerPort.postMessage({ port: channel.port2 }, [channel.port2]);

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
                        name: 'limboole',
                        publisher: 'soaibuzzaman',
                        version: '1.0.0',
                        engines: {
                            vscode: '*',
                        },
                        contributes: {
                            languages: [
                                {
                                    id: 'limboole',
                                    extensions: ['.limboole'],
                                    aliases: ['limboole', 'Limboole'],
                                    configuration: `./limboole-configuration.json`,
                                },
                            ],
                            grammars: [
                                {
                                    language: 'limboole',
                                    scopeName: 'source.limboole',
                                    path: `./limboole-grammar.json`,
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
                    uri: '/workspace/example.limboole',
                },
            },
            useDiffEditor: false,
        },
        languageClientConfig: {
            languageId: 'limboole',
            connection: {
                options: {
                    $type: 'WorkerDirect',
                    worker: limbooleWorkerPort,
                    messagePort: channel.port1,
                },
                messageTransports: {
                    reader,
                    writer,
                },
            },
            clientOptions: {
                documentSelector: ['limboole'],
            },
        },
    };
};
