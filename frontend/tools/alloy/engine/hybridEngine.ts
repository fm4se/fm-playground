import { AlloyEngineUnavailableError, type AlloyEngine, type AlloyInstanceRequest, type AlloyJson } from './types';

/** How many solution ids to remember for routing follow-up calls. */
const MAX_TRACKED_SOLUTIONS = 200;

/**
 * Prefers the in-browser engine and falls back to the server only when the browser engine cannot
 * run at all ({@link AlloyEngineUnavailableError}). Analysis results—including errors and
 * timeouts—are never retried on the server, so the server only sees load from browsers that
 * cannot help themselves.
 *
 * Follow-up calls (`nextInstance`, `evaluate`) go to the engine that produced the `specId`.
 */
export class HybridAlloyEngine implements AlloyEngine {
    readonly kind = 'hybrid' as const;

    private primaryUsable = true;
    private readonly owners = new Map<string, AlloyEngine>();

    constructor(
        private readonly primary: AlloyEngine,
        private readonly fallback: AlloyEngine,
        private readonly onFallback: (error: unknown) => void = (error) =>
            console.warn('[alloy-engine] In-browser engine unavailable, using the server.', error)
    ) {}

    /** Engine currently used for new analyses. */
    get active(): AlloyEngine {
        return this.primaryUsable ? this.primary : this.fallback;
    }

    async findInstance(request: AlloyInstanceRequest): Promise<AlloyJson> {
        const { engine, result } = await this.withFallback((e) => e.findInstance(request));
        const specId = specIdOf(result);
        if (specId) this.remember(specId, engine);
        return result;
    }

    nextInstance(specId: string): Promise<AlloyJson> {
        return this.ownerOf(specId).nextInstance(specId);
    }

    evaluate(specId: string, expr: string, state: number): Promise<AlloyJson> {
        return this.ownerOf(specId).evaluate(specId, expr, state);
    }

    async maxRedundantSet(code: string, cmdId: number): Promise<AlloyJson> {
        return (await this.withFallback((e) => e.maxRedundantSet(code, cmdId))).result;
    }

    async explainRedundancy(code: string, cursorPos: number): Promise<AlloyJson> {
        return (await this.withFallback((e) => e.explainRedundancy(code, cursorPos))).result;
    }

    private async withFallback(
        operation: (engine: AlloyEngine) => Promise<AlloyJson>
    ): Promise<{ engine: AlloyEngine; result: AlloyJson }> {
        if (this.primaryUsable) {
            try {
                return { engine: this.primary, result: await operation(this.primary) };
            } catch (error) {
                if (!(error instanceof AlloyEngineUnavailableError)) throw error;
                this.primaryUsable = false;
                this.onFallback(error);
            }
        }
        return { engine: this.fallback, result: await operation(this.fallback) };
    }

    private ownerOf(specId: string): AlloyEngine {
        return this.owners.get(specId) ?? this.active;
    }

    private remember(specId: string, engine: AlloyEngine): void {
        this.owners.delete(specId);
        this.owners.set(specId, engine);
        if (this.owners.size > MAX_TRACKED_SOLUTIONS) {
            this.owners.delete(this.owners.keys().next().value as string);
        }
    }
}

function specIdOf(result: AlloyJson): string | undefined {
    const id = result?.specId;
    return Array.isArray(id) ? id[0] : typeof id === 'string' ? id : undefined;
}
