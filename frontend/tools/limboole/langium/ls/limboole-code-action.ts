import type { CodeActionProvider } from 'langium/lsp';
import type { Diagnostic } from 'vscode-languageserver';
import type { Command, CodeAction } from 'vscode-languageserver-types';
import type { CodeActionParams } from 'vscode-languageserver-protocol';
import type { LimbooleServices } from './limboole-module.js';
import { LangiumDocument, MaybePromise } from 'langium';

export class LimbooleCodeActionProvider implements CodeActionProvider {

    constructor(services: LimbooleServices) { }


    getCodeActions(document: LangiumDocument, params: CodeActionParams): MaybePromise<Array<Command | CodeAction>> {
        const result: CodeAction[] = [];
        const acceptor = (ca: CodeAction | undefined) => ca && result.push(ca);
        for (const diagnostic of params.context.diagnostics) {
            this.createCodeActions(diagnostic, document, acceptor);
        }
        return result;
    }

    createCodeActions(diagnostic: Diagnostic, document: LangiumDocument, acceptor: (codeAction: CodeAction | undefined) => void): void {
        switch ((diagnostic.code as string)) {
            case 'typo':
                acceptor(this.createTypoCodeAction(diagnostic, document));
                break;
        }
    }

    private createTypoCodeAction(diagnostic: Diagnostic, document: LangiumDocument): CodeAction | undefined {
        const data = diagnostic.data?.typo
        if (data) {
            return {
                title: 'Replace with ' + data,
                kind: 'quickfix', // Showing the quick fix in the lightbulb menu
                edit: {
                    changes: {
                        [document.textDocument.uri]: [{
                            range: diagnostic.range,
                            newText: data
                        }]
                    }
                }
            };
        }

        return undefined;
    }
}
