/**
 * State shared by the LSP editors (LspEditor and LspDiffEditor): the VS Code API, which
 * can only be started once per page, and the language extensions registered with it.
 */
import { MonacoVscodeApiWrapper } from 'monaco-languageclient/vscodeApiWrapper';
import type { MonacoVscodeApiConfig } from 'monaco-languageclient/vscodeApiWrapper';
import type { LanguageClientConfig } from 'monaco-languageclient/lcwrapper';
import { registerExtension, ExtensionHostKind } from '@codingame/monaco-vscode-api/extensions';
import { encodeStringOrUrlToDataUrl } from 'monaco-languageclient/common';
import { activateLspMonacoEnvironment, rememberLspMonacoEnvironment } from './monacoEnvironment';

let apiStart: Promise<void> | null = null;
/** Extension id -> promise that resolves once the extension is registered and ready. */
const extensions = new Map<string, Promise<void>>();

const extensionId = (ext: { config: { publisher?: string; name: string } }) => `${ext.config.publisher}.${ext.config.name}`;

/**
 * Starts the VS Code API on first use; afterwards registers any language extensions from
 * `config` that aren't registered yet. Safe to call from several editors, also concurrently.
 */
export async function ensureVscodeApi(config: MonacoVscodeApiConfig): Promise<void> {
    // The CDN editors (diff fallback, plain editor) replace the global MonacoEnvironment;
    // put the LSP editors' environment back first (see monacoEnvironment.ts).
    activateLspMonacoEnvironment();

    if (!apiStart) {
        // The extensions in the first config are registered by the API start itself.
        const started = (async () => {
            const wrapper = new MonacoVscodeApiWrapper(config);
            await wrapper.start();
            rememberLspMonacoEnvironment();
        })();
        for (const ext of config.extensions ?? []) {
            extensions.set(extensionId(ext), started);
        }
        apiStart = started.catch((error) => {
            // Allow another attempt (as before this module existed), e.g. after the page
            // becomes visible when starting in a 0x0 viewport failed.
            apiStart = null;
            for (const ext of config.extensions ?? []) extensions.delete(extensionId(ext));
            throw error;
        });
        await apiStart;
        return;
    }

    await apiStart;
    for (const ext of config.extensions ?? []) {
        const id = extensionId(ext);
        if (!extensions.has(id)) {
            extensions.set(
                id,
                (async () => {
                    const result = registerExtension(ext.config, ExtensionHostKind.LocalProcess);
                    for (const [path, content] of ext.filesOrContents ?? []) {
                        (result as any).registerFileUrl(path, encodeStringOrUrlToDataUrl(content));
                    }
                    await result.whenReady();
                })()
            );
        }
        await extensions.get(id);
    }
}

/**
 * Terminates the language server worker created by a config creator. Used when a config
 * was created but its LanguageClientWrapper never started (startup cancelled or failed);
 * a started wrapper terminates it through `dispose(true)`.
 */
export function terminateLanguageServerWorker(config: LanguageClientConfig): void {
    const options = config.connection?.options as { worker?: { terminate?: () => void } } | undefined;
    options?.worker?.terminate?.();
}

/**
 * Upper bound for starting a language client. Without it a language server that never
 * answers (e.g. a Dafny WebSocket that fails after the config's 500 ms connection check)
 * leaves the editor blank forever instead of falling back to the plain editor.
 */
export const LSP_START_TIMEOUT_MS = 20_000;

export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms / 1000} s`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
