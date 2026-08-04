import type { ValidationAcceptor, AstNode } from 'langium';
import type { AlloyModule, SigDecl, ParaDecls, QualDeclName } from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';

export class AlloyNameValidator {
    constructor(services: AlloyServices) {}

    checkDuplicateNames(module: AlloyModule, accept: ValidationAcceptor): void {
        const typeNames = new Map<string, { node: AstNode, property: string }[]>();
        const callableNames = new Map<string, { node: AstNode, property: string }[]>();

        const addTypeName = (name: string | undefined, node: AstNode, property: string) => {
            if (name) {
                if (!typeNames.has(name)) typeNames.set(name, []);
                typeNames.get(name)!.push({ node, property });
            }
        };

        const addCallableName = (name: string | undefined, arity: number, node: AstNode, property: string) => {
            if (name) {
                const key = `${name}#${arity}`;
                if (!callableNames.has(key)) callableNames.set(key, []);
                callableNames.get(key)!.push({ node, property });
            }
        };

        const getArity = (paraDecls: ParaDecls | undefined): number => {
            let arity = 0;
            if (paraDecls?.decls) {
                for (const decl of paraDecls.decls) {
                    arity += 1; // Primary name
                    arity += (decl as any).additionalNames?.length || 0;
                }
            }
            return arity;
        };

        for (const p of module.paragraph || []) {
            switch (p.$type) {
                case 'SigDecl':
                    addTypeName(p.name, p, 'name');
                    for (const addSig of (p as SigDecl).additionalSigs || []) {
                        addTypeName(addSig.name, addSig, 'name');
                    }
                    break;
                case 'EnumDecl':
                    addTypeName(p.name, p, 'name');
                    break;
                case 'MacroDecl':
                case 'PredDecl':
                case 'FunDecl':
                    addCallableName(p.name, getArity((p as any).paraDecls), p, 'name');
                    break;
                // Facts, asserts, and commands are just labels and can overlap with other names.
            }
        }

        for (const [name, nodes] of typeNames.entries()) {
            if (nodes.length > 1) {
                for (const { node, property } of nodes) {
                    accept('error', `Duplicate type naming: '${name}' is already defined.`, {
                        node,
                        property
                    });
                }
            }
        }

        for (const [key, nodes] of callableNames.entries()) {
            if (nodes.length > 1) {
                const [name, arity] = key.split('#');
                for (const { node, property } of nodes) {
                    accept('error', `Duplicate callable naming: '${name}' with arity ${arity} is already defined.`, {
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
