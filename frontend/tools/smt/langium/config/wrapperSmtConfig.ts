import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override';
import getLifecycleServiceOverride from '@codingame/monaco-vscode-lifecycle-service-override';
import getLocalizationServiceOverride from '@codingame/monaco-vscode-localization-service-override';
import { createDefaultLocaleConfiguration } from 'monaco-languageclient/vscodeApiLocales';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageclient/browser.js';
import smtLanguageConfig from './language-configuration.json?raw';
import responseSmtTm from '../syntaxes/smt.tmLanguage.json?raw';
import { configureMonacoWorkers } from '../utils';
import workerPortUrlSmt from '../worker/smt-server-port?worker&url';
import type { LspConfig } from '@/../tools/common/lspTypes';

const loadLangiumWorkerPort = () => {
    return new Worker(workerPortUrlSmt, {
        type: 'module',
        name: 'Smt Server Port',
    });
};

export const createLangiumSmtConfig = async (): Promise<LspConfig> => {
    const extensionFilesOrContents = new Map<string, string | URL>();
    extensionFilesOrContents.set(`/smt-configuration.json`, smtLanguageConfig);
    extensionFilesOrContents.set(`/smt-grammar.json`, responseSmtTm);

    const smtWorkerPort = loadLangiumWorkerPort();

    const channel = new MessageChannel();
    smtWorkerPort.postMessage({ port: channel.port2 }, [channel.port2]);

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
                        name: 'smt',
                        publisher: 'soaibuzzaman',
                        version: '1.0.0',
                        engines: {
                            vscode: '*',
                        },
                        contributes: {
                            languages: [
                                {
                                    id: 'smt',
                                    extensions: ['.smt2'],
                                    aliases: ['smt', 'Smt'],
                                    configuration: `./smt-configuration.json`,
                                },
                            ],
                            grammars: [
                                {
                                    language: 'smt',
                                    scopeName: 'source.smt',
                                    path: `./smt-grammar.json`,
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
                    uri: '/workspace/example.smt2',
                },
            },
            useDiffEditor: false,
        },
        languageClientConfig: {
            languageId: 'smt',
            connection: {
                options: {
                    $type: 'WorkerDirect',
                    worker: smtWorkerPort,
                    messagePort: channel.port1,
                },
                messageTransports: { reader, writer },
            },
            clientOptions: {
                documentSelector: ['smt'],
            },
        },
    };
};
