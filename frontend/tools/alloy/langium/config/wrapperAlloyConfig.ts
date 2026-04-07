import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override';
import getLifecycleServiceOverride from '@codingame/monaco-vscode-lifecycle-service-override';
import getLocalizationServiceOverride from '@codingame/monaco-vscode-localization-service-override';
import { createDefaultLocaleConfiguration } from 'monaco-languageclient/vscodeApiLocales';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageclient/browser.js';
import alloyLanguageConfig from './language-configuration.json?raw';
import responseAlloyTm from '../syntaxes/alloy.tmLanguage.json?raw';
import { configureMonacoWorkers } from '../utils';
import workerPortUrlAlloy from '../worker/alloy-server-port?worker&url';
import type { LspConfig } from '@/../tools/common/lspTypes';

const loadLangiumWorkerPort = () => {
    return new Worker(workerPortUrlAlloy, {
        type: 'module',
        name: 'Alloy Server Port',
    });
};

export const createLangiumAlloyConfig = async (): Promise<LspConfig> => {
    const extensionFilesOrContents = new Map<string, string | URL>();
    extensionFilesOrContents.set(`/alloy-configuration.json`, alloyLanguageConfig);
    extensionFilesOrContents.set(`/alloy-grammar.json`, responseAlloyTm);

    const alloyWorkerPort = loadLangiumWorkerPort();

    const channel = new MessageChannel();
    alloyWorkerPort.postMessage({ port: channel.port2 }, [channel.port2]);

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
                        name: 'alloy',
                        publisher: 'soaibuzzaman',
                        version: '1.0.0',
                        engines: {
                            vscode: '*',
                        },
                        contributes: {
                            languages: [
                                {
                                    id: 'alloy',
                                    extensions: ['.als'],
                                    aliases: ['alloy', 'Alloy'],
                                    configuration: `./alloy-configuration.json`,
                                },
                            ],
                            grammars: [
                                {
                                    language: 'alloy',
                                    scopeName: 'source.alloy',
                                    path: `./alloy-grammar.json`,
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
                    uri: '/workspace/example.als',
                },
            },
            useDiffEditor: false,
        },
        languageClientConfig: {
            languageId: 'alloy',
            connection: {
                options: {
                    $type: 'WorkerDirect',
                    worker: alloyWorkerPort,
                    messagePort: channel.port1,
                },
                messageTransports: { reader, writer },
            },
            clientOptions: {
                documentSelector: ['alloy'],
            },
        },
    };
};
