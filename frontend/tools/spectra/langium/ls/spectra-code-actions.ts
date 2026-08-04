import type { CodeActionProvider } from 'langium/lsp';
import type { Diagnostic } from 'vscode-languageserver';
import type { Command, CodeAction } from 'vscode-languageserver-types';
import type { CodeActionParams } from 'vscode-languageserver-protocol';
import type { SpectraServices } from './spectra-module.js';
import { LangiumDocument, MaybePromise } from 'langium';
import { Range } from 'vscode-languageserver-types';

export class SpectraCodeActionProvider implements CodeActionProvider {

    constructor(services: SpectraServices) { }

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
            // Add case for the DwyerPatternsImportError
            case 'ImportError':
                acceptor(this.createImportDwyerPatternsAction(diagnostic, document));
                break;
            // Add more cases for other diagnostics if needed
        }
    }

    private createImportDwyerPatternsAction(diagnostic: Diagnostic, document: LangiumDocument): CodeAction | undefined {
        const importStatement = 'import "DwyerPatterns.spectra"\n';
        const insertRange: Range = { // insert at the beginning of the document
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
        };

        return {
            title: "import DwyerPatterns.spectra",
            kind: 'quickfix',
            diagnostics: [diagnostic],
            isPreferred: true,
            edit: {
                changes: {
                    [document.textDocument.uri]: [{
                        range: insertRange,
                        newText: importStatement
                    }]
                }
            }
        };
    }
}