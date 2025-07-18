import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override';
import getLifecycleServiceOverride from '@codingame/monaco-vscode-lifecycle-service-override';
import getLocalizationServiceOverride from '@codingame/monaco-vscode-localization-service-override';
import { createDefaultLocaleConfiguration } from 'monaco-languageclient/vscode/services';
import { LogLevel } from 'vscode/services';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageclient/browser.js';
import { WrapperConfig } from 'monaco-editor-wrapper';
import { configureMonacoWorkers } from '@/../tools/limboole/langium/utils';
// limboole specific imports
import workerPortUrlLimboole from '@/../tools/limboole/langium/worker/limboole-server-port?worker&url';
import limbooleLanguageConfig from '@/../tools/limboole/langium/config/language-configuration.json?raw';
import responseLimbooleTm from '@/../tools/limboole/langium/syntaxes/limboole.tmLanguage.json?raw';
// Smt specific imports
import workerPortUrlSmt from '@/../tools/smt/langium/worker/smt-server-port?worker&url';
import smtLanguageConfig from '@/../tools/smt/langium/config/language-configuration.json?raw';
import responseSmtTm from '@/../tools/smt/langium/syntaxes/smt.tmLanguage.json?raw';
// Spectra specific imports
import workerPortUrlSpectra from '@/../tools/spectra/langium/worker/spectra-server-port?worker&url';
import spectraLanguageConfig from '@/../tools/spectra/langium/config/language-configuration.json?raw';
import responseSpectraTm from '@/../tools/spectra/langium/syntaxes/spectra.tmLanguage.json?raw';

const loadSmtpWorkerPort = () => {
    console.log(`Smt worker URL: ${workerPortUrlSmt}`);
    return new Worker(workerPortUrlSmt, {
        type: 'module',
        name: 'Smt Server Port',
    });
};

const loadLimbooleWorkerPort = () => {
    console.log(`Limboole worker URL: ${workerPortUrlLimboole}`);
    return new Worker(workerPortUrlLimboole, {
        type: 'module',
        name: 'Limboole Server Port',
    });
};

const loadSpectraWorkerPort = () => {
    return new Worker(workerPortUrlSpectra, {
        type: 'module',
        name: 'Spectra Server Port',
    });
};

export const createLangiumGlobalConfig = async (): Promise<WrapperConfig> => {
    // Load the worker ports for Limboole
    const limbooleExtensionFilesOrContents = new Map<string, string | URL>();
    limbooleExtensionFilesOrContents.set(`/limboole-configuration.json`, limbooleLanguageConfig);
    limbooleExtensionFilesOrContents.set(`/limboole-grammar.json`, responseLimbooleTm);

    // Load the worker ports for SMT
    const smtExtensionFilesOrContents = new Map<string, string | URL>();
    smtExtensionFilesOrContents.set(`/smt-configuration.json`, smtLanguageConfig);
    smtExtensionFilesOrContents.set(`/smt-grammar.json`, responseSmtTm);

    // Load the worker ports for Limboole
    const spectraExtensionFilesOrContents = new Map<string, string | URL>();
    spectraExtensionFilesOrContents.set(`/spectra-configuration.json`, spectraLanguageConfig);
    spectraExtensionFilesOrContents.set(`/spectra-grammar.json`, responseSpectraTm);

    // Load the workers
    const smtWorkerPort = loadSmtpWorkerPort();
    const limbooleWorkerPort = loadLimbooleWorkerPort();
    const spectraWorkerPort = loadSpectraWorkerPort();

    // Create message channels for each worker
    const smtChannel = new MessageChannel();
    smtWorkerPort.postMessage({ port: smtChannel.port2 }, [smtChannel.port2]);

    const limbooleChannel = new MessageChannel();
    limbooleWorkerPort.postMessage({ port: limbooleChannel.port2 }, [limbooleChannel.port2]);

    const spectraChannel = new MessageChannel();
    spectraWorkerPort.postMessage({ port: spectraChannel.port2 }, [spectraChannel.port2]);

    // Create message readers and writers for each channel
    const smtReader = new BrowserMessageReader(smtChannel.port1);
    const smtWriter = new BrowserMessageWriter(smtChannel.port1);

    const limbooleReader = new BrowserMessageReader(limbooleChannel.port1);
    const limbooleWriter = new BrowserMessageWriter(limbooleChannel.port1);

    const spectraReader = new BrowserMessageReader(spectraChannel.port1);
    const spectraWriter = new BrowserMessageWriter(spectraChannel.port1);

    return {
        id: '42',
        logLevel: LogLevel.Debug,
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
                    fileExt: '',
                },
            },
            useDiffEditor: false,
            extensions: [
                {
                    config: {
                        name: 'smt-example',
                        publisher: 'soaibuzzaman',
                        version: '1.0.0',
                        engine: {
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
                    filesOrContents: smtExtensionFilesOrContents,
                },
                {
                    config: {
                        name: 'limboole-example',
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
                    filesOrContents: limbooleExtensionFilesOrContents,
                },
                {
                    config: {
                        name: 'spectra-example',
                        publisher: 'soaibuzzaman',
                        version: '1.0.0',
                        engine: {
                            vscode: '*',
                        },
                        contributes: {
                            languages: [
                                {
                                    id: 'spectra',
                                    extensions: ['.spectra'],
                                    aliases: ['spectra', 'Spectra'],
                                    configuration: `./spectra-configuration.json`,
                                },
                            ],
                            grammars: [
                                {
                                    language: 'spectra',
                                    scopeName: 'source.spectra',
                                    path: `./spectra-grammar.json`,
                                },
                            ],
                        },
                    },
                    filesOrContents: spectraExtensionFilesOrContents,
                },
            ],
            userConfiguration: {
                json: JSON.stringify({
                    'workbench.colorTheme': 'Default Light Modern',
                    'editor.guides.bracketPairsHorizontal': 'active',
                    'editor.wordBasedSuggestions': 'off',
                    'editor.experimental.asyncTokenization': true,
                    'editor.semanticHighlighting.enabled': true,
                    'editor.tokenColorCustomizations': {
                        textMateRules: [
                            {
                                scope: 'keyword.system.spectra',
                                settings: {
                                    foreground: '#189BCC',
                                    fontStyle: 'bold',
                                },
                            },
                            {
                                scope: 'keyword.environment.spectra',
                                settings: {
                                    foreground: '#0CD806',
                                    fontStyle: 'bold',
                                },
                            },
                            {
                                scope: 'keyword.regex.spectra',
                                settings: {
                                    foreground: '#FF00FF',
                                    fontStyle: 'bold',
                                },
                            },
                        ],
                    },
                }),
            },
            monacoWorkerFactory: configureMonacoWorkers,
        },
        languageClientConfigs: {
            smt: {
                languageId: 'smt',
                connection: {
                    options: {
                        $type: 'WorkerDirect',
                        worker: smtWorkerPort,
                        messagePort: smtChannel.port1,
                    },
                    messageTransports: { reader: smtReader, writer: smtWriter },
                },
            },
            limboole: {
                languageId: 'limboole',
                connection: {
                    options: {
                        $type: 'WorkerDirect',
                        worker: limbooleWorkerPort,
                        messagePort: limbooleChannel.port1,
                    },
                    messageTransports: { reader: limbooleReader, writer: limbooleWriter },
                },
            },
            spectra: {
                languageId: 'spectra',
                connection: {
                    options: {
                        $type: 'WorkerDirect',
                        worker: spectraWorkerPort,
                        messagePort: spectraChannel.port1,
                    },
                    messageTransports: { reader: spectraReader, writer: spectraWriter },
                },
            },
        },
    };
};
