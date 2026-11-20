import type { MonacoVscodeApiConfig } from 'monaco-languageclient/vscodeApiWrapper';
import type { LanguageClientConfig } from 'monaco-languageclient/lcwrapper';
import type { EditorAppConfig } from 'monaco-languageclient/editorApp';

/** Options for the per-tool LSP config creators. */
export interface LspConfigOptions {
    /**
     * Attach the tool's LSP research telemetry (SMT and Alloy) and start a new telemetry
     * episode. Default: true. The diff view passes false so its editing neither resets nor
     * counts toward the main editor's episode.
     */
    telemetry?: boolean;
    /**
     * With telemetry: start a new episode (reset the counters). Default: true. False when
     * syntax checking is switched back on, which continues the current episode.
     */
    startNewTelemetryEpisode?: boolean;
}

export interface LspConfig {
    vscodeApiConfig: MonacoVscodeApiConfig;
    editorAppConfig: EditorAppConfig;
    languageClientConfig: LanguageClientConfig;
    /**
     * Set when the language server is known to be unreachable (e.g. the Dafny proxy is
     * down). The editor parts of the config are still usable: the editor starts without
     * a language client instead of falling back to the CDN editor.
     */
    languageServerError?: Error;
}
