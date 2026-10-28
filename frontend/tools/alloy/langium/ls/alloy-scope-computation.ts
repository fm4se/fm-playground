import { DefaultScopeComputation, type AstNodeDescription, type LangiumDocument } from 'langium';
import { CancellationToken } from 'vscode-languageserver-protocol';
import { 
    isAlloyModule, 
    isSigDecl, 
    isFieldDecl, 
    isEnumDecl,
    isPredDecl,
    isFunDecl,
    isAssertDecl,
    isDecl
} from './generated/ast.js';

export class AlloyScopeComputation extends DefaultScopeComputation {
    override async collectExportedSymbols(document: LangiumDocument, cancelToken = CancellationToken.None): Promise<AstNodeDescription[]> {
        const exportedSymbols: AstNodeDescription[] = [];
        const rootNode = document.parseResult.value;

        if (isAlloyModule(rootNode)) {
            // Traverse the top-level paragraphs to find exportable symbols
            for (const paragraph of rootNode.paragraph) {
                if (cancelToken.isCancellationRequested) {
                    break;
                }

                if (isSigDecl(paragraph)) {
                    // Export primary signature name
                    if (paragraph.name) {
                        exportedSymbols.push(this.descriptions.createDescription(paragraph, paragraph.name, document));
                    }
                    
                    // Export additional signatures (e.g. sig A, B, C)
                    if (paragraph.additionalSigs) {
                        for (const additionalSig of paragraph.additionalSigs) {
                            if (additionalSig.name) {
                                exportedSymbols.push(this.descriptions.createDescription(additionalSig, additionalSig.name, document));
                            }
                        }
                    }

                    // Export fields inside the signature, one description per field name
                    if (paragraph.fields) {
                        for (const field of paragraph.fields) {
                            if (isFieldDecl(field) && isDecl(field.decl)) {
                                for (const declName of field.decl.names) {
                                    if (declName.name) {
                                        exportedSymbols.push(this.descriptions.createDescription(declName, declName.name, document));
                                    }
                                }
                            }
                        }
                    }
                } else if (isEnumDecl(paragraph)) {
                    if (paragraph.name) {
                        exportedSymbols.push(this.descriptions.createDescription(paragraph, paragraph.name, document));
                    }
                    for (const value of paragraph.values) {
                        if (value.name) {
                            exportedSymbols.push(this.descriptions.createDescription(value, value.name, document));
                        }
                    }
                } else if (isPredDecl(paragraph) || isFunDecl(paragraph) || isAssertDecl(paragraph)) {
                    if (paragraph.name) {
                        exportedSymbols.push(this.descriptions.createDescription(paragraph, paragraph.name, document));
                    }
                }
            }
        }

        return exportedSymbols;
    }
}
