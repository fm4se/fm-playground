import { AlloyEngineUnavailableError } from '../types';
import type { AlloyBrowserBackend, EngineMethod, FromWorker, LoadedBackend, ToWorker } from './protocol';

/** The call exceeded its time limit; the worker (and all state in it) was discarded. */
export class AlloyAnalysisTimeoutError extends Error {
    constructor(readonly seconds: number) {
        super(`Analysis timed out after ${seconds} seconds.`);
        this.name = 'AlloyAnalysisTimeoutError';
    }
}

interface Pending {
    resolve: (json: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export interface WorkerClientOptions {
    /** Shown in dev tools, e.g. "alloy-instances". */
    name: string;
    assetBaseUrl: string;
    backend: AlloyBrowserBackend;
    /** Injectable for tests. */
    createWorker?: (name: string) => Worker;
}

const defaultCreateWorker = (name: string) =>
    new Worker(new URL('./alloy.worker.ts', import.meta.url), { type: 'module', name });

/**
 * Owns one engine worker: starts it lazily, correlates requests and responses, and enforces
 * timeouts by terminating the worker (SAT solving cannot be interrupted any other way). A new
 * worker is started on the next call.
 */
export class AlloyWorkerClient {
    private worker: Worker | null = null;
    private nextId = 1;
    private readonly pending = new Map<number, Pending>();
    private loadedBackend: LoadedBackend | null = null;

    constructor(private readonly options: WorkerClientOptions) {}

    /** Backend of the running worker, once it has answered at least once. */
    get backend(): LoadedBackend | null {
        return this.loadedBackend;
    }

    call(method: EngineMethod, args: Array<string | number>, timeoutMs: number): Promise<string> {
        const worker = this.ensureWorker();
        const id = this.nextId++;
        return new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.discardWorker(new AlloyAnalysisTimeoutError(Math.round(timeoutMs / 1000)));
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            worker.postMessage({ kind: 'call', id, method, args } satisfies ToWorker);
        });
    }

    /** Stops the worker and rejects outstanding calls. */
    terminate(): void {
        this.discardWorker(new AlloyEngineUnavailableError('Alloy engine was stopped.'));
    }

    private ensureWorker(): Worker {
        if (this.worker) return this.worker;
        let worker: Worker;
        try {
            worker = (this.options.createWorker ?? defaultCreateWorker)(this.options.name);
        } catch (error) {
            throw new AlloyEngineUnavailableError('Could not start the Alloy engine worker.', { cause: error });
        }
        worker.onmessage = (event: MessageEvent<FromWorker>) => this.onMessage(event.data);
        worker.onerror = (event: ErrorEvent) => {
            event.preventDefault();
            this.discardWorker(
                new AlloyEngineUnavailableError(`Alloy engine worker crashed: ${event.message || 'unknown error'}`)
            );
        };
        worker.postMessage({
            kind: 'init',
            assetBaseUrl: this.options.assetBaseUrl,
            backend: this.options.backend,
        } satisfies ToWorker);
        this.worker = worker;
        return worker;
    }

    private onMessage(message: FromWorker): void {
        const pending = this.pending.get(message.id);
        if (!pending) return; // answer to a call that already timed out
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.kind === 'result') {
            this.loadedBackend = message.backend;
            pending.resolve(message.json);
        } else {
            // The engine could not run at all; start from scratch next time.
            pending.reject(new AlloyEngineUnavailableError(message.message));
            this.discardWorker(new AlloyEngineUnavailableError(message.message));
        }
    }

    private discardWorker(reason: Error): void {
        this.worker?.terminate();
        this.worker = null;
        this.loadedBackend = null;
        for (const { reject, timer } of this.pending.values()) {
            clearTimeout(timer);
            reject(reason);
        }
        this.pending.clear();
    }
}
