import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override';
import getLifecycleServiceOverride from '@codingame/monaco-vscode-lifecycle-service-override';
import getLocalizationServiceOverride from '@codingame/monaco-vscode-localization-service-override';
import { createDefaultLocaleConfiguration } from 'monaco-languageclient/vscode/services';
import { LogLevel } from 'vscode/services';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageclient/browser.js';
import { WrapperConfig } from 'monaco-editor-wrapper';
import limbooleLanguageConfig from './language-configuration.json?raw';
import responseLimbooleTm from '../syntaxes/limboole.tmLanguage.json?raw';
import { configureMonacoWorkers } from '../utils';
import workerPortUrlLimboole from '../worker/limboole-server-port?worker&url';

const loadLangiumWorkerPort = () => {
    return new Worker(workerPortUrlLimboole, {
        type: 'module',
        name: 'Limboole Server Port',
    });
};

export const createLangiumLimbooleConfig = async (): Promise<WrapperConfig> => {
    const extensionFilesOrContents = new Map<string, string | URL>();
    extensionFilesOrContents.set(`/limboole-configuration.json`, limbooleLanguageConfig);
    extensionFilesOrContents.set(`/limboole-grammar.json`, responseLimbooleTm);

    const limbooleWorkerPort = loadLangiumWorkerPort();
    const channel = new MessageChannel();
    limbooleWorkerPort.postMessage({ port: channel.port2 }, [channel.port2]);

    const reader = new BrowserMessageReader(channel.port1);
    const writer = new BrowserMessageWriter(channel.port1);

    return {
        logLevel: LogLevel.Error,
        serviceConfig: {
            userServices: {
                ...getKeybindingsServiceOverride(),
                ...getLifecycleServiceOverride(),
                ...getLocalizationServiceOverride(createDefaultLocaleConfiguration()),
            },
        },
        editorAppConfig: {
            $type: 'extended',
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
                main: {
                    text: '',
                    fileExt: 'limboole',
                },
            },
            useDiffEditor: false,
            extensions: [
                {
                    config: {
                        name: 'limboole',
                        publisher: 'soaibuzzaman',
                        version: '1.0.0',
                        engine: {
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
        languageClientConfigs: {
            limboole: {
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
            },
        },
    };
};
