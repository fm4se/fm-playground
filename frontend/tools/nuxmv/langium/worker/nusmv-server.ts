/// <reference lib="WebWorker" />

import { start } from './nusmv-server-start.js';

declare const self: DedicatedWorkerGlobalScope;

start(self, 'nusmv-server');
