import type { AlloyEngineConfig } from '../config';
import type { AlloyEngine, AlloyInstanceRequest, AlloyJson } from '../types';
import type { EngineMethod } from './protocol';
import { AlloyAnalysisTimeoutError, AlloyWorkerClient } from './workerClient';

/**
 * Runs analyses in the user's browser with the TeaVM-compiled Java engine (same code as the
 * server, with the pure-Java SAT4J solver).
 *
 * Two independent workers keep the UI responsive: one owns instances (find / next / evaluate),
 * the other runs redundancy analyses, so a background redundancy check never delays "Next".
 */
export class BrowserAlloyEngine implements AlloyEngine {
    readonly kind = 'browser' as const;

    private readonly instances: AlloyWorkerClient;
    private readonly analyses: AlloyWorkerClient;

    constructor(
        private readonly config: Pick<
            AlloyEngineConfig,
            'assetBaseUrl' | 'browserBackend' | 'instanceTimeoutMs' | 'analysisTimeoutMs'
        >,
        createClient: (name: string) => AlloyWorkerClient = (name) =>
            new AlloyWorkerClient({ name, assetBaseUrl: config.assetBaseUrl, backend: config.browserBackend })
    ) {
        this.instances = createClient('alloy-instances');
        this.analyses = createClient('alloy-analyses');
    }

    findInstance({ code, cmd }: AlloyInstanceRequest): Promise<AlloyJson> {
        return this.run(this.instances, 'findInstance', [code, cmd], this.config.instanceTimeoutMs);
    }

    nextInstance(specId: string): Promise<AlloyJson> {
        return this.run(this.instances, 'nextInstance', [specId], this.config.instanceTimeoutMs);
    }

    evaluate(specId: string, expr: string, state: number): Promise<AlloyJson> {
        return this.run(this.instances, 'evaluate', [specId, expr, state], this.config.instanceTimeoutMs);
    }

    maxRedundantSet(code: string, cmdId: number): Promise<AlloyJson> {
        return this.run(this.analyses, 'maxRedundantSet', [code, cmdId], this.config.analysisTimeoutMs);
    }

    explainRedundancy(code: string, cursorPos: number): Promise<AlloyJson> {
        return this.run(this.analyses, 'explainRedundancyAtCursor', [code, cursorPos], this.config.analysisTimeoutMs);
    }

    /** Releases both workers (e.g. when leaving the Alloy tool). */
    dispose(): void {
        this.instances.terminate();
        this.analyses.terminate();
    }

    private async run(
        client: AlloyWorkerClient,
        method: EngineMethod,
        args: Array<string | number>,
        timeoutMs: number
    ): Promise<AlloyJson> {
        try {
            return JSON.parse(await client.call(method, args, timeoutMs));
        } catch (error) {
            // Report timeouts exactly like the server does: as an in-band analysis error.
            if (error instanceof AlloyAnalysisTimeoutError) {
                return { error: error.message, status: 400 };
            }
            throw error;
        }
    }
}
