/// <reference lib="WebWorker" />

/**
 * Forwards uncaught errors and unhandled promise rejections from a language
 * server worker to the main thread, where `monitorWorker` (src/monitoring.ts)
 * reports them to GlitchTip with full stack traces.
 *
 * Import this module FIRST in a worker entry file: imports are evaluated in
 * order, so errors thrown while the language server modules load are covered.
 *
 * The SDK uses the worker's own message channel; the LSP traffic runs over a
 * separate MessageChannel port, so the two don't interfere.
 */
import { registerWebWorker } from '@sentry/react';

declare const self: DedicatedWorkerGlobalScope;

// Without a DSN the main thread doesn't listen, and this is removed from the bundle.
if (import.meta.env.VITE_GLITCHTIP_DSN) {
    registerWebWorker({ self });
}
