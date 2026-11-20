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
}

export interface LspConfig {
    vscodeApiConfig: MonacoVscodeApiConfig;
    editorAppConfig: EditorAppConfig;
    languageClientConfig: LanguageClientConfig;
}
