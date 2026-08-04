import type { ValidationAcceptor, AstNode } from 'langium';
import type { AlloyModule, SigDecl, ParaDecls, QualDeclName } from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';

export class AlloyNameValidator {
    constructor(services: AlloyServices) {}

    checkDuplicateNames(module: AlloyModule, accept: ValidationAcceptor): void {
        const nameToNodes = new Map<string, { node: AstNode, property: string }[]>();

        const addName = (name: string | undefined, node: AstNode, property: string) => {
            if (name) {
                if (!nameToNodes.has(name)) {
                    nameToNodes.set(name, []);
                }
                nameToNodes.get(name)!.push({ node, property });
            }
        };

        for (const p of module.paragraph || []) {
            switch (p.$type) {
                case 'SigDecl':
                    addName(p.name, p, 'name');
                    for (const addSig of p.additionalSigs || []) {
                        addName(addSig.name, addSig, 'name');
                    }
                    break;
                case 'MacroDecl':
                case 'PredDecl':
                case 'FunDecl':
                case 'EnumDecl':
                    addName(p.name, p, 'name');
                    break;
                case 'FactDecl':
                case 'AssertDecl':
                case 'CmdDecl':
                    if (p.name) {
                        addName(p.name, p, 'name');
                    }
                    break;
            }
        }

        for (const [name, nodes] of nameToNodes.entries()) {
            if (nodes.length > 1) {
                for (const { node, property } of nodes) {
                    accept('error', `Duplicate naming: '${name}' is already defined.`, {
                        node,
                        property
                    });
                }
            }
        }
    }

    checkDuplicateFields(sig: SigDecl, accept: ValidationAcceptor): void {
        const seenNames = new Map<string, AstNode[]>();

        const addName = (qualDecl: QualDeclName | undefined) => {
            if (!qualDecl || !qualDecl.name) return;
            const name = qualDecl.name;
            if (!seenNames.has(name)) seenNames.set(name, []);
            seenNames.get(name)!.push(qualDecl);
        };

        for (const field of sig.fields || []) {
            if (field.decl) {
                addName(field.decl.name);
                for (const add of field.decl.additionalNames || []) {
                    addName(add);
                }
            }
        }

        for (const [name, nodes] of seenNames.entries()) {
            if (nodes.length > 1) {
                for (const node of nodes) {
                    accept('error', `sig "this/${sig.name}" cannot have 2 fields named "${name}"`, {
                        node,
                        property: 'name'
                    });
                }
            }
        }
    }

    checkDuplicateParameters(paraDecls: ParaDecls, accept: ValidationAcceptor): void {
        const seenNames = new Map<string, AstNode[]>();

        const addName = (qualDecl: QualDeclName | undefined) => {
            if (!qualDecl || !qualDecl.name) return;
            const name = qualDecl.name;
            if (!seenNames.has(name)) seenNames.set(name, []);
            seenNames.get(name)!.push(qualDecl);
        };

        for (const decl of paraDecls.decls || []) {
            addName(decl.name);
            for (const add of decl.additionalNames || []) {
                addName(add);
            }
        }

        for (const [name, nodes] of seenNames.entries()) {
            if (nodes.length > 1) {
                for (const node of nodes) {
                    accept('error', `The parameter name "${name}" cannot appear more than once.`, {
                        node,
                        property: 'name'
                    });
                }
            }
        }
    }
}
