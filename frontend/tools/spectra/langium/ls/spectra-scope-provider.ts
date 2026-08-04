import { DefaultScopeProvider, ReferenceInfo, Scope } from 'langium';
import { LangiumServices } from 'langium/lsp';
import { AstUtils, StreamScope } from 'langium';
import { isModel } from './generated/ast.js';
import { DWYER_PATTERNS_URI } from './spectra-workspace-manager.js';
import { URI } from 'vscode-uri';

export class SpectraScopeProvider extends DefaultScopeProvider {
    services: any;
    constructor(services: LangiumServices) {
        super(services);
    }

    override getScope(context: ReferenceInfo): Scope {
        const defaultScope = super.getScope(context);
        const referenceNode = context.container
        const model = AstUtils.getContainerOfType(referenceNode, isModel);

        if (!model) {
            return defaultScope;
        }

        const currentDocument = AstUtils.getDocument(model);

        const currentUri = currentDocument.uri.toString();

        if (currentUri === DWYER_PATTERNS_URI.toString()) {
            return defaultScope;
        }

        const importDwyerPatterns = model.imports.some(imp => {
            const importString = (imp as any).strValue || imp.$cstNode?.text;
            if (!importString) return false;

            return importString.includes('DwyerPatterns.spectra') || importString.includes('DwyerPatterns');
        })
        if (importDwyerPatterns) {
            return defaultScope;
        }
        else {
            const filteredScope = this.createFilteredScope(defaultScope, DWYER_PATTERNS_URI);
            return filteredScope;
        }
    }

    protected createFilteredScope(baseScope: Scope, uriToFilter: URI): Scope {
        const uriStringToFilter = uriToFilter.toString();
        // Filter out all descriptions originating from the specified URI
        const filteredStream = baseScope.getAllElements().filter(desc => {
            // Ensure desc.documentUri exists before accessing toString()
            return desc.documentUri?.toString() !== uriStringToFilter;
        });
        // Use streamScope for potentially better performance with large scopes
        return new StreamScope(filteredStream);
    }
}