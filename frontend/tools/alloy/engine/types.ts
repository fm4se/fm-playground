import type { Permalink } from '@/types';

/**
 * JSON document returned by every Alloy operation.
 *
 * It is the same wire format for server-side and in-browser execution (both are produced by the
 * Java `alloy-engine` module). Analysis errors are reported in-band as `{ error, status: 400 }`.
 */
export type AlloyJson = Record<string, any>;

/** Where an analysis runs. */
export type AlloyEngineKind = 'browser' | 'server';

export interface AlloyInstanceRequest {
    /** Source of the model (used by the in-browser engine). */
    code: string;
    /** Saved permalink of the same source (used by the server, which loads the code itself). */
    permalink: Permalink;
    /** 0-based command index. */
    cmd: number;
}

/**
 * All Alloy analyses the playground offers. Implementations decide where they run; callers never
 * need to know.
 */
export interface AlloyEngine {
    readonly kind: AlloyEngineKind | 'hybrid';

    /** Executes a command and returns the first instance (`specId` identifies it later). */
    findInstance(request: AlloyInstanceRequest): Promise<AlloyJson>;

    /** Next instance of a previously found solution. */
    nextInstance(specId: string): Promise<AlloyJson>;

    /** Evaluates an expression on the current instance of `specId` in temporal state `state`. */
    evaluate(specId: string, expr: string, state: number): Promise<AlloyJson>;

    /** Maximal set of redundant constraints; `cmdId === -1` checks all commands. */
    maxRedundantSet(code: string, cmdId: number): Promise<AlloyJson>;

    /** Explains why the constraint at the 1-based character offset `cursorPos` is redundant. */
    explainRedundancy(code: string, cursorPos: number): Promise<AlloyJson>;
}

/**
 * The in-browser engine cannot be used (unsupported browser, failed download, crashed worker).
 * Thrown—never returned in-band—so a hybrid engine can fall back to the server.
 */
export class AlloyEngineUnavailableError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'AlloyEngineUnavailableError';
    }
}
