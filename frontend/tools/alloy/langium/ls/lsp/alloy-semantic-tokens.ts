import type { AstNode } from 'langium';
import { AbstractSemanticTokenProvider, type SemanticTokenAcceptor } from 'langium/lsp';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import {
    isAdditionalSig, isAssertDecl, isAtExpr, isBuiltinExpr, isCmdDecl, isDeclName, isEnumDecl, isEnumValue, isFactDecl, isFieldDecl,
    isFunDecl, isLetDecl, isMacroDecl, isMacroParam, isModuleParam, isParaDecls, isPredDecl, isQualName, isSigDecl
} from '../generated/ast.js';
import { isBuiltinReference, qualifiedText } from '../typing/sig-model.js';

/** Builtin names that denote sets; the others (disj, plus, ...) are functions or predicates. */
const BUILTIN_SETS = new Set(['univ', 'none', 'iden', 'Int', 'seq/Int', 'String', 'steps']);

/**
 * Semantic highlighting: tells sigs, fields, predicates/functions, parameters and variables
 * apart, which the TextMate grammar cannot do since they are all plain identifiers.
 */
export class AlloySemanticTokenProvider extends AbstractSemanticTokenProvider {

    protected highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void | undefined | 'prune' {
        if (isQualName(node)) {
            node.names.forEach((_, index) => acceptor({ node, property: 'names', index, type: SemanticTokenTypes.namespace }));
            const target = node.ref.ref;
            if (!target) return;
            if (isBuiltinReference(node)) {
                const set = BUILTIN_SETS.has(qualifiedText(node));
                acceptor({
                    node, property: 'ref', type: set ? SemanticTokenTypes.type : SemanticTokenTypes.function,
                    modifier: [SemanticTokenModifiers.defaultLibrary]
                });
                return;
            }
            const type = tokenType(target);
            if (type) acceptor({ node, property: 'ref', type });
            return;
        }
        if (isAtExpr(node)) {
            const target = node.ref.ref;
            const type = target && tokenType(target);
            if (type) acceptor({ node, property: 'ref', type });
            return;
        }
        if (isBuiltinExpr(node)) {
            acceptor({ node, property: 'name', type: SemanticTokenTypes.function, modifier: [SemanticTokenModifiers.defaultLibrary] });
            return;
        }
        if (isCmdDecl(node) && node.name) {
            acceptor({ node, property: 'name', type: SemanticTokenTypes.event, modifier: [SemanticTokenModifiers.declaration] });
            return;
        }
        const type = tokenType(node);
        if (type && 'name' in node && node.name) {
            acceptor({ node, property: 'name', type, modifier: [SemanticTokenModifiers.declaration] });
        }
    }
}

function tokenType(node: AstNode): string | undefined {
    if (isSigDecl(node) || isAdditionalSig(node)) return SemanticTokenTypes.class;
    if (isEnumDecl(node)) return SemanticTokenTypes.enum;
    if (isEnumValue(node)) return SemanticTokenTypes.enumMember;
    if (isModuleParam(node)) return SemanticTokenTypes.typeParameter;
    if (isPredDecl(node) || isFunDecl(node)) return SemanticTokenTypes.function;
    if (isMacroDecl(node)) return SemanticTokenTypes.macro;
    if (isFactDecl(node) || isAssertDecl(node)) return SemanticTokenTypes.interface;
    if (isMacroParam(node)) return SemanticTokenTypes.parameter;
    if (isLetDecl(node)) return SemanticTokenTypes.variable;
    if (isDeclName(node)) {
        const owner = node.$container.$container;
        if (isFieldDecl(owner)) return SemanticTokenTypes.property;
        if (isParaDecls(owner)) return SemanticTokenTypes.parameter;
        return SemanticTokenTypes.variable;
    }
    return undefined;
}
