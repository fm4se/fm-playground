import type { AstNode } from 'langium';
import { AbstractSemanticTokenProvider, type SemanticTokenAcceptor } from 'langium/lsp';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import {
    isAttribute, isBinaryConstant, isConstructorDec, isConstructorPattern, isDecimalConstant, isDeclareConst, isDeclareDatatype,
    isDeclareFun, isDeclareRel, isDeclareSort, isDeclareSortParameter, isDeclareTypeVar, isDeclareVar, isDefineConst, isDefineSort,
    isFunctionDec, isFunctionDef, isGetInfo, isGetOption, isHexadecimalConstant, isIndexedIdentifier, isIndexedSort,
    isLegacyDatatypeDec, isNamedAttribute, isNumeralConstant, isNumeralIndex, isPatternAttribute, isPatternVariable,
    isSelectorDec, isSimpleIdentifier, isSimpleSort, isSortDec, isSortParameter, isSortedVar, isStringConstant, isVarBinding,
    isSetLogic, isEcho
} from '../generated/ast.js';
import type { BuiltinLibrary } from '../builtins/library.js';
import type { SmtServices } from '../smt-module.js';

/**
 * Semantic highlighting: distinguishes theory symbols, user functions, constants,
 * bound variables, constructors, selectors and sorts, which plain TextMate grammars
 * cannot tell apart in SMT-LIB's uniform s-expression syntax.
 */
export class SmtSemanticTokenProvider extends AbstractSemanticTokenProvider {

    protected readonly builtins: BuiltinLibrary;

    constructor(services: SmtServices) {
        super(services);
        this.builtins = services.builtins.BuiltinLibrary;
    }

    protected highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void | undefined | 'prune' {
        // References
        if (isSimpleIdentifier(node) || isIndexedIdentifier(node)) {
            const target = node.symbol?.ref;
            if (target) {
                const [type, modifiers] = this.tokenFor(target, node.symbol.$refText);
                acceptor({ node, property: 'symbol', type, modifier: modifiers });
            }
            if (isIndexedIdentifier(node)) this.highlightIndices(node.indices, acceptor);
            return;
        }
        if (isSimpleSort(node) || isIndexedSort(node)) {
            const target = node.symbol?.ref;
            if (target) {
                const builtin = this.builtins.isBuiltinNode(target);
                const type = isSortParameter(target) || isDeclareSortParameter(target) || isDeclareTypeVar(target) ? SemanticTokenTypes.typeParameter : SemanticTokenTypes.type;
                acceptor({ node, property: 'symbol', type, modifier: builtin ? [SemanticTokenModifiers.defaultLibrary] : [] });
            }
            if (isIndexedSort(node)) this.highlightIndices(node.indices, acceptor);
            return;
        }
        if (isConstructorPattern(node) && node.constructorSymbol?.ref) {
            acceptor({ node, property: 'constructorSymbol', type: SemanticTokenTypes.enumMember });
            return;
        }
        // Declarations
        const decl = SmtSemanticTokenProvider.declarationToken(node);
        if (decl) {
            acceptor({ node, property: 'name', type: decl, modifier: [SemanticTokenModifiers.declaration] });
        }
        // Literals and attributes
        if (isNumeralConstant(node) || isDecimalConstant(node) || isHexadecimalConstant(node) || isBinaryConstant(node)) {
            acceptor({ node, property: 'value', type: SemanticTokenTypes.number });
        } else if (isStringConstant(node)) {
            acceptor({ node, property: 'value', type: SemanticTokenTypes.string });
        } else if (isEcho(node)) {
            acceptor({ node, property: 'text', type: SemanticTokenTypes.string });
        } else if (isAttribute(node)) {
            acceptor({ node, property: 'keyword', type: SemanticTokenTypes.decorator });
        } else if (isNamedAttribute(node) || isPatternAttribute(node)) {
            acceptor({ node, keyword: isNamedAttribute(node) ? ':named' : node.key, type: SemanticTokenTypes.decorator });
        } else if (isGetInfo(node)) {
            acceptor({ node, property: 'flag', type: SemanticTokenTypes.decorator });
        } else if (isGetOption(node)) {
            acceptor({ node, property: 'option', type: SemanticTokenTypes.decorator });
        } else if (isSetLogic(node)) {
            acceptor({ node, property: 'logic', type: SemanticTokenTypes.namespace });
        }
    }

    private highlightIndices(indices: AstNode[], acceptor: SemanticTokenAcceptor): void {
        for (const index of indices) {
            if (isNumeralIndex(index)) acceptor({ node: index, property: 'value', type: SemanticTokenTypes.number });
        }
    }

    protected tokenFor(target: AstNode, refText: string): [string, string[]] {
        if (this.builtins.isBuiltinNode(target)) {
            const specs = this.builtins.getFunctionSpecs(refText);
            const constant = specs.length > 0 && specs.every(s => s.ranks.every(r => r.trim().startsWith('->')));
            return [constant ? SemanticTokenTypes.enumMember : SemanticTokenTypes.function, [SemanticTokenModifiers.defaultLibrary]];
        }
        if (isConstructorDec(target)) return [refText === target.name ? SemanticTokenTypes.enumMember : SemanticTokenTypes.function, []];
        if (isSelectorDec(target)) return [SemanticTokenTypes.property, []];
        if (isSortedVar(target)) {
            const param = isFunctionDef(target.$container) || isFunctionDec(target.$container);
            return [param ? SemanticTokenTypes.parameter : SemanticTokenTypes.variable, []];
        }
        if (isVarBinding(target) || isPatternVariable(target)) return [SemanticTokenTypes.variable, []];
        if (isDeclareFun(target) || isDeclareRel(target)) {
            return target.parameters.length > 0 ? [SemanticTokenTypes.function, []] : [SemanticTokenTypes.variable, [SemanticTokenModifiers.readonly]];
        }
        if (isFunctionDef(target) || isFunctionDec(target)) {
            return target.parameters.length > 0 ? [SemanticTokenTypes.function, []] : [SemanticTokenTypes.variable, [SemanticTokenModifiers.readonly]];
        }
        if (isNamedAttribute(target)) return [SemanticTokenTypes.variable, [SemanticTokenModifiers.readonly]];
        return [SemanticTokenTypes.variable, [SemanticTokenModifiers.readonly]];
    }

    static declarationToken(node: AstNode): string | undefined {
        if (isDeclareConst(node) || isDefineConst(node) || isDeclareVar(node)) return SemanticTokenTypes.variable;
        if (isDeclareFun(node) || isDeclareRel(node)) return node.parameters.length > 0 ? SemanticTokenTypes.function : SemanticTokenTypes.variable;
        if (isFunctionDef(node) || isFunctionDec(node)) return node.parameters.length > 0 ? SemanticTokenTypes.function : SemanticTokenTypes.variable;
        if (isConstructorDec(node)) return SemanticTokenTypes.enumMember;
        if (isSelectorDec(node)) return SemanticTokenTypes.property;
        if (isSortedVar(node)) return isFunctionDef(node.$container) || isFunctionDec(node.$container) ? SemanticTokenTypes.parameter : SemanticTokenTypes.variable;
        if (isVarBinding(node) || (isPatternVariable(node) && node.name !== '_')) return SemanticTokenTypes.variable;
        if (isNamedAttribute(node)) return SemanticTokenTypes.variable;
        if (isDeclareSort(node) || isDefineSort(node) || isDeclareDatatype(node) || isSortDec(node) || isLegacyDatatypeDec(node)) return SemanticTokenTypes.type;
        if (isSortParameter(node) || isDeclareSortParameter(node) || isDeclareTypeVar(node)) return SemanticTokenTypes.typeParameter;
        return undefined;
    }
}
