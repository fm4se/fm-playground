/**
 * Keeps the two Monaco copies (Plain Editor, LSP Editor) in the playground from overwriting each other's settings.
 * Both read their settings from the single global MonacoEnvironment object
 * Without this module, visiting the diff view once erased the LSP editor's state, and it fell back to the plain editor for the rest of the session Issue #41.
 * So each copy gets its own environment object, which is put in place before that copy's editor starts. Monaco only reads it when starting the editor or a web worker.
 */

import { useCallback, useEffect, useRef } from 'react';

type MonacoEnvironmentObject = Record<string, unknown>;

const globals = globalThis as { MonacoEnvironment?: MonacoEnvironmentObject };

let lspEnvironment: MonacoEnvironmentObject | undefined;
let cdnEnvironment: MonacoEnvironmentObject | undefined;
let mountedCdnEditors = 0;

/** Call before the LSP editor starts the VS Code API, a language client or an editor. */
export function activateLspMonacoEnvironment(): void {
    if (lspEnvironment) {
        globals.MonacoEnvironment = lspEnvironment;
    } else if (cdnEnvironment && globals.MonacoEnvironment === cdnEnvironment) {
        // First LSP start after the CDN copy loaded: start from a clean object instead of adding the LSP settings to the CDN copy's
        // its getWorker would take precedenc3e
        globals.MonacoEnvironment = {};
    }
}

/** Call once the VS Code API has started, so its environment can be restored later. */
export function rememberLspMonacoEnvironment(): void {
    lspEnvironment = globals.MonacoEnvironment;
}

/**
 * Runs after the CDN copy has loaded and before a @monaco-editor/react editor is created.
 */
function activateCdnMonacoEnvironment(): void {
    mountedCdnEditors += 1;
    if (!cdnEnvironment && globals.MonacoEnvironment && globals.MonacoEnvironment !== lspEnvironment) {
        cdnEnvironment = globals.MonacoEnvironment;
    }
    if (cdnEnvironment) {
        globals.MonacoEnvironment = cdnEnvironment;
    }
}

/** Hands the environment back to the LSP editor once no CDN editor is mounted. */
function releaseCdnMonacoEnvironment(): void {
    mountedCdnEditors = Math.max(0, mountedCdnEditors - 1);
    if (mountedCdnEditors === 0 && lspEnvironment) {
        globals.MonacoEnvironment = lspEnvironment;
    }
}

/**
 * For components rendering a @monaco-editor/react editor: 
 * returns the  beforeMount handler and releases the environment on unmount. 
 * Only releases what it activated, since the component can unmount while the CDN copy is still loading.
 */
export function useCdnMonacoEnvironment(): () => void {
    const activeRef = useRef(false);
    useEffect(
        () => () => {
            if (activeRef.current) {
                activeRef.current = false;
                releaseCdnMonacoEnvironment();
            }
        },
        []
    );
    return useCallback(() => {
        if (!activeRef.current) {
            activeRef.current = true;
            activateCdnMonacoEnvironment();
        }
    }, []);
}
