/**
 * State shared by the LSP editors (LspEditor and LspDiffEditor): the VS Code API, which
 * can only be started once per page, the language extensions registered with it, and the
 * editor colour theme.
 */
import * as vscode from 'vscode';
import { MonacoVscodeApiWrapper } from 'monaco-languageclient/vscodeApiWrapper';
import type { MonacoVscodeApiConfig } from 'monaco-languageclient/vscodeApiWrapper';
import type { LanguageClientConfig } from 'monaco-languageclient/lcwrapper';
import { registerExtension, ExtensionHostKind } from '@codingame/monaco-vscode-api/extensions';
import { encodeStringOrUrlToDataUrl } from 'monaco-languageclient/common';
import { activateLspMonacoEnvironment, rememberLspMonacoEnvironment } from './monacoEnvironment';

let apiStart: Promise<void> | null = null;
let apiReady = false;

/* ---------- Colour theme ---------- */

const LIGHT_THEME = 'Default Light Modern';
const DARK_THEME = 'Default Dark Modern';
let darkTheme = false;

/** Applies the app's dark/light mode to all editors on this Monaco (one global VS Code theme). */
export function setEditorDarkTheme(dark: boolean): void {
    darkTheme = dark;
    if (apiReady) applyColorTheme();
}

function applyColorTheme(): void {
    const theme = darkTheme ? DARK_THEME : LIGHT_THEME;
    const settings = vscode.workspace.getConfiguration('workbench');
    if (settings.get('colorTheme') !== theme) {
        settings.update('colorTheme', theme, vscode.ConfigurationTarget.Global).then(undefined, (error: unknown) => {
            console.warn('Could not switch the editor colour theme:', error);
        });
    }
}

/** Starts the API with the current theme already set, so the editor doesn't flash light first. */
function withCurrentTheme(config: MonacoVscodeApiConfig): MonacoVscodeApiConfig {
    const json = config.userConfiguration?.json;
    if (!json) return config;
    try {
        const settings = JSON.parse(json);
        settings['workbench.colorTheme'] = darkTheme ? DARK_THEME : LIGHT_THEME;
        return { ...config, userConfiguration: { ...config.userConfiguration, json: JSON.stringify(settings) } };
    } catch {
        return config;
    }
}

/* ---------- VS Code API ---------- */
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
            const wrapper = new MonacoVscodeApiWrapper(withCurrentTheme(config));
            await wrapper.start();
            rememberLspMonacoEnvironment();
            apiReady = true;
            // The theme may have been toggled while the API was starting.
            applyColorTheme();
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
