import {
    AstNode,
    GenericAstNode,
    DefaultScopeComputation,
    LangiumCoreServices,
    LangiumDocument,
    MultiMap,
    type AstNodeDescription
} from "langium";
import { isReferrable, isTypeDef, isVar, isVarDecl, TypeDef, Var, VarDecl } from "./generated/ast.js";

export class SpectraScopeComputation extends DefaultScopeComputation {
    services: any;
    constructor(services: LangiumCoreServices) {
        super(services);
    }

    protected override addLocalSymbol(node: AstNode, document: LangiumDocument, symbols: MultiMap<AstNode, AstNodeDescription>): void {
        const container = node.$container;
        
        // This is replicating what DefaultScopeComputation does if we want default behavior,
        // but we only add if it matches our specific conditions below or we fallback.
        // Actually, looking at default, it adds to container if name exists.
        // The original code only added for isReferrable, isTypeDef, etc.
        // But to be safe and replicate the old `processNode`, we just implement our rules here.

        if (container && isReferrable(node)) {
            const name = this.nameProvider.getName(node);
            if (name) {
                const description = this.descriptions.createDescription(node, name, document);
                symbols.add(container, description);

                if (container.$container && node.$containerProperty) {
                    const value = (container as GenericAstNode)[node.$containerProperty as string];
                    if (Array.isArray(value)) symbols.add(container.$container, description);
                }
            }
        }

        if (container && isTypeDef(node)) {
            const typeDefNode = node as TypeDef;
            const constants = Array.isArray(typeDefNode.type.const) ? typeDefNode.type.const : [];
            for (const constant of constants) {
                const constantName = this.nameProvider.getName(constant);
                if (constantName) {
                    const constantDescription = this.descriptions.createDescription(constant, constantName, document);
                    symbols.add(container, constantDescription);
                }
            }
        }

        if (container && isVar(node)) {
            const typeDefNode = node as Var;
            const constants = Array.isArray(typeDefNode.type.const) ? typeDefNode.type.const : [];
            for (const constant of constants) {
                const constantName = this.nameProvider.getName(constant);
                if (constantName) {
                    const constantDescription = this.descriptions.createDescription(constant, constantName, document);
                    symbols.add(container, constantDescription);
                }
            }
        }

        if (container && isVarDecl(node)) {
            const typeDefNode = node as VarDecl;
            const constants = Array.isArray(typeDefNode.type.const) ? typeDefNode.type.const : [];
            for (const constant of constants) {
                const constantName = this.nameProvider.getName(constant);
                if (constantName) {
                    const constantDescription = this.descriptions.createDescription(constant, constantName, document);
                    symbols.add(container, constantDescription);
                }
            }
        }
    }
}
