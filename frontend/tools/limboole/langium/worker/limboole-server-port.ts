/// <reference lib="WebWorker" />

// Must stay the first import (see workerMonitoring.ts).
import '../../../common/workerMonitoring';
import { start } from './limboole-server-start.js';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent) => {
    const data = event.data;
    if (data.port !== undefined) {
        start(data.port, 'limboole-server-port');

        setTimeout(() => {
            self.postMessage('started');
        }, 1000);
    }
};
