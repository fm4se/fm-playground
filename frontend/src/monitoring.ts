/**
 * Error and performance monitoring, reported to our self-hosted GlitchTip
 */
import * as Sentry from '@sentry/react';

const DSN: string | undefined = import.meta.env.VITE_GLITCHTIP_DSN;

export function initMonitoring(): void {
    if (!DSN) return;

    const version = import.meta.env.VITE_FMP_VERSION;

    Sentry.init({
        dsn: DSN,
        release: version ? `fmp-frontend@${version}` : undefined,
        environment: import.meta.env.VITE_GLITCHTIP_ENVIRONMENT || import.meta.env.MODE,

        // Collect as little as possible. In particular, request/response bodies would
        // contain the specifications users submit, and the `p` query parameter is a
        // permalink to a user's code; only `check` (the selected tool) is kept.
        dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: false,
            httpBodies: [],
            urlQueryParams: { allow: ['check'] },
            stackFrameVariables: false,
        },

        integrations: (defaults) => [
            // GlitchTip doesn't support session tracking, and console.log/info/debug
            // calls are mostly debug noise. Warnings and errors are kept as breadcrumbs.
            ...defaults.filter((i) => i.name !== 'BrowserSession' && i.name !== 'Console'),
            Sentry.consoleIntegration({ levels: ['warn', 'error'] }),
            Sentry.browserTracingIntegration(),
        ],

        // Page-load / navigation performance (incl. Web Vitals) for a sample of visits.
        tracesSampleRate: Number(import.meta.env.VITE_GLITCHTIP_TRACES_SAMPLE_RATE ?? 0.1),
        // GlitchTip ingests classic transactions; the SDK's default ('stream') sends
        // spans in a format it doesn't show.
        traceLifecycle: 'static',
        // The backends aren't instrumented, so don't add trace headers to their requests.
        tracePropagationTargets: [],

        ignoreErrors: [
            // Benign browser warning, frequently triggered by the editor's layout code.
            /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/,
            // Monaco cancels in-flight work (e.g. completions) by rejecting with "Canceled".
            /^Canceled(: Canceled)?$/,
        ],
    });
}

/**
 * Errors thrown when a lazily loaded chunk can't be fetched, typically because a
 * new version was deployed while the page was open (or the connection dropped).
 */
export function isChunkLoadError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
        message
    );
}
