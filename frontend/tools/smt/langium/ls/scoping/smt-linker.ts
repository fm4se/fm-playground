import { AstUtils, DefaultLinker, type AstNodeDescription, type LinkingError, type ReferenceInfo } from 'langium';
import type { SmtServices } from '../smt-module.js';
import type { SmtScopeProvider } from './smt-scope-provider.js';
import { closest } from '../validation/smt-validator.js';

/**
 * Produces SMT-LIB specific messages for unresolved symbols: whether the symbol is
 * used before its declaration, was removed by `pop`/`reset`, or is likely a typo.
 */
export class SmtLinker extends DefaultLinker {

    protected readonly smtScopeProvider: SmtScopeProvider;

    constructor(services: SmtServices) {
        super(services);
        this.smtScopeProvider = services.references.ScopeProvider as SmtScopeProvider;
    }

    protected override createLinkingError(refInfo: ReferenceInfo, targetDescription?: AstNodeDescription): LinkingError {
        if (targetDescription) return super.createLinkingError(refInfo, targetDescription);
        const name = refInfo.reference.$refText;
        const isSort = this.reflection.getReferenceType(refInfo) === 'SortSymbol';
        const what = isSort ? 'sort' : 'symbol';
        let message = `Unknown ${what} '${name}'.`;
        try {
            const document = AstUtils.getDocument(refInfo.container);
            const offset = refInfo.container.$cstNode?.offset ?? 0;
            const table = this.smtScopeProvider.getSymbolTable(document);
            const declarations = table.allNamed(name, isSort ? 'sort' : 'function');
            const later = declarations.find(d => d.from > offset);
            const removed = declarations.find(d => d.to <= offset);
            const position = (o: number) => document.textDocument.positionAt(o).line + 1;
            if (removed) {
                message = `'${name}' is no longer declared here: its declaration was removed at line ${position(removed.to)} (pop/reset).`;
            } else if (later) {
                message = `'${name}' is used before its declaration (line ${position(later.command.$cstNode?.offset ?? later.from)}). SMT-LIB symbols must be declared before use.`;
            } else {
                const candidates = this.smtScopeProvider.getScope(refInfo).getAllElements().map(d => d.name).toArray();
                const suggestion = closest(name, candidates);
                if (suggestion) message += ` Did you mean '${suggestion}'?`;
            }
        } catch {
            // Keep the generic message.
        }
        return { info: refInfo, message };
    }
}
