import type { ValidationAcceptor, AstNode } from 'langium';
import type { AlloyModule, SigDecl, ParaDecls, DeclName } from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';

const SIG_MULTIPLICITIES = new Set(['lone', 'one', 'some']);

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
                    arity += decl.names.length;
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
                    addCallableName(p.name, p.params.length, p, 'name');
                    break;
                case 'PredDecl':
                case 'FunDecl':
                    addCallableName(p.name, getArity(p.paraDecls), p, 'name');
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

    // Alloy accepts sig qualifiers in any order, but each only once and at most one multiplicity.
    checkSigQualifiers(sig: SigDecl, accept: ValidationAcceptor): void {
        const seen = new Set<string>();
        sig.qualifiers.forEach((qualifier, index) => {
            if (seen.has(qualifier)) {
                accept('error', 'The same qualifier cannot be specified more than once for the same sig.', {
                    node: sig,
                    property: 'qualifiers',
                    index
                });
            }
            seen.add(qualifier);
        });
        if (sig.qualifiers.filter(q => SIG_MULTIPLICITIES.has(q)).length > 1) {
            accept('error', 'A sig can have at most one multiplicity (lone, one or some).', {
                node: sig,
                property: 'qualifiers'
            });
        }
    }

    checkDuplicateFields(sig: SigDecl, accept: ValidationAcceptor): void {
        const seenNames = new Map<string, AstNode[]>();

        const addName = (declName: DeclName) => {
            if (!declName.name) return;
            const name = declName.name;
            if (!seenNames.has(name)) seenNames.set(name, []);
            seenNames.get(name)!.push(declName);
        };

        for (const field of sig.fields || []) {
            field.decl?.names.forEach(addName);
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

        const addName = (declName: DeclName) => {
            if (!declName.name) return;
            const name = declName.name;
            if (!seenNames.has(name)) seenNames.set(name, []);
            seenNames.get(name)!.push(declName);
        };

        for (const decl of paraDecls.decls || []) {
            decl.names.forEach(addName);
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
