import { configureDefaultWorkerFactory } from 'monaco-languageclient/workerFactory';
import type { ILogger } from '@codingame/monaco-vscode-log-service-override';

export const disableButton = (id: string, disabled: boolean) => {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (button !== null) {
        button.disabled = disabled;
    }
};

export const configureMonacoWorkers = (logger?: ILogger) => {
    configureDefaultWorkerFactory(logger);
};
