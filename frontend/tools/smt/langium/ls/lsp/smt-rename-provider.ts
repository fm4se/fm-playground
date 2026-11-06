import { CstUtils, type LangiumDocument, type MaybePromise } from 'langium';
import { DefaultRenameProvider } from 'langium/lsp';
import { TextEdit, type Range, type RenameParams, type TextDocumentPositionParams, type WorkspaceEdit } from 'vscode-languageserver';
import type { SmtServices } from '../smt-module.js';
import type { BuiltinLibrary } from '../builtins/library.js';
import { printSymbol } from '../typing/sorts.js';

/**
 * Renames user symbols. Builtins cannot be renamed; references written as Z3 testers
 * (`is-C`) keep their prefix; names are quoted with `|...|` when necessary.
 */
export class SmtRenameProvider extends DefaultRenameProvider {

    protected readonly builtins: BuiltinLibrary;

    constructor(services: SmtServices) {
        super(services);
        this.builtins = services.builtins.BuiltinLibrary;
    }

    override prepareRename(document: LangiumDocument, params: TextDocumentPositionParams): MaybePromise<Range | undefined> {
        const target = this.findTarget(document, params);
        if (!target || this.builtins.isBuiltinNode(target)) return undefined;
        return super.prepareRename(document, params);
    }

    override async rename(document: LangiumDocument, params: RenameParams): Promise<WorkspaceEdit | undefined> {
        const target = this.findTarget(document, params);
        if (!target || this.builtins.isBuiltinNode(target)) return undefined;
        const newName = printSymbol(params.newName.replace(/^\|(.*)\|$/, '$1'));
        const changes: Record<string, TextEdit[]> = {};
        for (const ref of this.references.findReferences(target, { includeDeclaration: true })) {
            const uri = ref.sourceUri.toString();
            const text = ref.segment ? document.textDocument.getText(ref.segment.range) : '';
            const prefixed = /^\|?is-/.test(text) && !text.startsWith('|is-') ? `is-${params.newName}` : undefined;
            const edit = TextEdit.replace(ref.segment.range, prefixed ? printSymbol(prefixed) : newName);
            (changes[uri] ??= []).push(edit);
        }
        return { changes };
    }

    private findTarget(document: LangiumDocument, params: TextDocumentPositionParams) {
        const root = document.parseResult.value.$cstNode;
        if (!root) return undefined;
        const offset = document.textDocument.offsetAt(params.position);
        const leaf = CstUtils.findDeclarationNodeAtOffset(root, offset, this.grammarConfig.nameRegexp);
        return leaf ? this.references.findDeclarations(leaf)[0] : undefined;
    }
}
