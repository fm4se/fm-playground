import { DefaultScopeComputation, MultiMap, type AstNode, type AstNodeDescription, type LangiumDocument, type LocalSymbols } from 'langium';

/**
 * SMT-LIB scripts are self-contained: nothing is exported to other documents, and
 * local scopes are computed on demand by SmtScopeProvider (they depend on the order
 * of commands and on push/pop, which the default precomputation cannot express).
 */
export class SmtScopeComputation extends DefaultScopeComputation {

    override async collectExportedSymbols(_document: LangiumDocument): Promise<AstNodeDescription[]> {
        return [];
    }

    override async collectLocalSymbols(_document: LangiumDocument): Promise<LocalSymbols> {
        return new MultiMap<AstNode, AstNodeDescription>();
    }
}
