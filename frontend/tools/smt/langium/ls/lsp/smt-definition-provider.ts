import type { CstNode } from 'langium';
import { DefaultDefinitionProvider, type GoToLink } from 'langium/lsp';
import type { SmtServices } from '../smt-module.js';
import type { BuiltinLibrary } from '../builtins/library.js';

/** Go-to-definition, except for builtin theory symbols (they have no source). */
export class SmtDefinitionProvider extends DefaultDefinitionProvider {

    protected readonly builtins: BuiltinLibrary;

    constructor(services: SmtServices) {
        super(services);
        this.builtins = services.builtins.BuiltinLibrary;
    }

    protected override findLinks(source: CstNode): GoToLink[] {
        return super.findLinks(source).filter(link => !this.builtins.isBuiltinNode(link.target.astNode));
    }
}
