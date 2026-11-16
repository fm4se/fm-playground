/**
 * Human-readable descriptions (signatures and documentation) of symbols, shared by
 * hover, completion and signature help.
 */
import { AstUtils, type AstNode } from 'langium';
import {
    isConstructorDec, isDeclareConst, isDeclareDatatype, isDeclareFun, isDeclareRel, isDeclareSort, isDeclareSortParameter,
    isDeclareTypeVar, isDeclareVar, isDefineConst, isDefineSort, isFunctionDec, isFunctionDef, isLegacyDatatypeDec,
    isNamedAttribute, isPatternVariable, isSelectorDec, isSortDec, isSortParameter, isSortedVar, isVarBinding,
    isDeclareDatatypes, isDatatypeDec, isAnnotatedTerm, isLetTerm,
    type FunctionSymbol, type Term
} from '../generated/ast.js';
import type { BuiltinFunctionSpec } from '../builtins/types.js';
import type { SmtServices } from '../smt-module.js';
import { parseRank, printSymbol, sortToString, UNKNOWN, type Sort } from '../typing/sorts.js';

export type SymbolCategory =
    | 'builtin-function' | 'builtin-sort' | 'constant' | 'function' | 'constructor' | 'selector' | 'variable'
    | 'parameter' | 'sort' | 'datatype' | 'sort-parameter' | 'named' | 'relation';

export interface SymbolDescription {
    category: SymbolCategory;
    /** One-line signature, e.g. `(declare-fun f (Int) Bool)` or `bvadd: (_ BitVec m) (_ BitVec m)+ -> (_ BitVec m)`. */
    signature: string;
    /** Additional signatures for overloaded builtins. */
    overloads: string[];
    documentation?: string;
    theory?: string;
}

export class SymbolDescriber {

    constructor(private readonly services: SmtServices) { }

    describe(node: AstNode, refText?: string): SymbolDescription | undefined {
        const builtins = this.services.builtins.BuiltinLibrary;
        const checker = this.services.typing.SortChecker;
        const name = (node as { name?: string }).name ?? '';
        if (builtins.isBuiltinNode(node)) {
            if (isDeclareSort(node)) {
                const spec = builtins.getSortSpec(name);
                if (!spec) return undefined;
                const params = Array.from({ length: spec.arity }, (_, i) => String.fromCharCode(88 + i)); // X, Y, ...
                const head = spec.indices ? `(_ ${printSymbol(name)} ${spec.indices.join(' ')})` : printSymbol(name);
                const signature = params.length > 0 ? `(${head} ${params.join(' ')})` : head;
                return {
                    category: 'builtin-sort', signature, overloads: [], theory: spec.theory,
                    documentation: spec.doc + (spec.alias ? `\n\nAbbreviation of \`${spec.alias}\`.` : '')
                };
            }
            const symbol = refText && /^bv\d+$/.test(refText) ? 'bv' : name;
            const specs = builtins.getFunctionSpecs(symbol);
            if (specs.length === 0) return undefined;
            const lines = specs.flatMap(spec => spec.ranks.map(rank => formatRank(spec, rank)));
            return {
                category: 'builtin-function', signature: lines[0], overloads: lines.slice(1), theory: specs[0].theory,
                documentation: [...new Set(specs.map(s => s.doc))].join('\n\n') + (specs.every(s => s.z3Only) ? '\n\n*Z3 extension.*' : '')
            };
        }

        const comment = this.leadingComment(node);
        const text = (n: AstNode | undefined) => n?.$cstNode?.text ?? '?';
        if (isDeclareConst(node) || isDeclareVar(node)) {
            return { category: 'constant', signature: `(${isDeclareVar(node) ? 'declare-var' : 'declare-const'} ${printSymbol(name)} ${text(node.sort)})`, overloads: [], documentation: comment };
        }
        if (isDefineConst(node)) {
            return { category: 'constant', signature: `(define-const ${printSymbol(name)} ${text(node.sort)} …)`, overloads: [], documentation: comment };
        }
        if (isDeclareFun(node)) {
            const category = node.parameters.length === 0 ? 'constant' : 'function';
            return { category, signature: `(declare-fun ${printSymbol(name)} (${node.parameters.map(text).join(' ')}) ${text(node.sort)})`, overloads: [], documentation: comment };
        }
        if (isDeclareRel(node)) {
            return { category: 'relation', signature: `(declare-rel ${printSymbol(name)} (${node.parameters.map(text).join(' ')}))`, overloads: [], documentation: comment };
        }
        if (isFunctionDef(node) || isFunctionDec(node)) {
            const keyword = isFunctionDef(node) ? (node.$container.kind ?? 'define-fun') : 'define-funs-rec';
            const params = node.parameters.map(p => `(${printSymbol(p.name)} ${text(p.sort)})`).join(' ');
            return {
                category: node.parameters.length === 0 ? 'constant' : 'function',
                signature: `(${keyword} ${printSymbol(name)} (${params}) ${text(node.sort)} …)`, overloads: [],
                documentation: this.leadingComment(isFunctionDef(node) ? node.$container : node.$container) ?? comment
            };
        }
        if (isConstructorDec(node)) {
            const sig = checker.signatureOf(node);
            const dt = sig ? sortToString(sig.result) : '?';
            const fields = node.selectors.map(s => `(${printSymbol(s.name)} ${text(s.sort)})`).join(' ');
            return {
                category: 'constructor',
                signature: `constructor ${printSymbol(name)}${fields ? ' ' + fields : ''} : ${dt}`, overloads: [],
                documentation: `Tester: \`(_ is ${printSymbol(name)})\` or \`is-${name}\`.`
            };
        }
        if (isSelectorDec(node)) {
            const sig = checker.signatureOf(node);
            return {
                category: 'selector',
                signature: `selector ${printSymbol(name)} : ${sig ? `${sortToString(sig.params[0] ?? UNKNOWN)} -> ${sortToString(sig.result)}` : text(node.sort)}`,
                overloads: [], documentation: `Field of constructor \`${node.$container.name}\`.`
            };
        }
        if (isSortedVar(node)) {
            const owner = node.$container;
            const kind = isFunctionDef(owner) || isFunctionDec(owner) ? 'parameter' : 'bound variable';
            return { category: kind === 'parameter' ? 'parameter' : 'variable', signature: `${kind} ${printSymbol(name)} : ${text(node.sort)}`, overloads: [] };
        }
        if (isVarBinding(node)) {
            return { category: 'variable', signature: `let ${printSymbol(name)} : ${this.sortText(node.value)}`, overloads: [] };
        }
        if (isPatternVariable(node)) {
            return { category: 'variable', signature: `pattern variable ${printSymbol(name)}`, overloads: [] };
        }
        if (isNamedAttribute(node)) {
            const annotated = node.$container;
            const sort = isAnnotatedTerm(annotated) ? this.sortText(annotated.term) : '?';
            return { category: 'named', signature: `named term ${printSymbol(name)} : ${sort}`, overloads: [], documentation: 'Introduced with `:named`; usable in `check-sat-assuming`, unsat cores and `get-assignment`.' };
        }
        // Sorts
        if (isDeclareSort(node)) {
            return { category: 'sort', signature: `(declare-sort ${printSymbol(name)} ${node.arity ?? 0})`, overloads: [], documentation: comment };
        }
        if (isDefineSort(node)) {
            return { category: 'sort', signature: `(define-sort ${printSymbol(name)} (${node.parameters.map(p => printSymbol(p.name)).join(' ')}) ${text(node.sort)})`, overloads: [], documentation: comment };
        }
        if (isDeclareDatatype(node) || isSortDec(node) || isLegacyDatatypeDec(node)) {
            const ctors = this.datatypeConstructors(node);
            return {
                category: 'datatype', signature: `datatype ${printSymbol(name)}`, overloads: [],
                documentation: (ctors.length > 0 ? `Constructors: ${ctors.map(c => `\`${c}\``).join(', ')}` : '') + (comment ? `\n\n${comment}` : '')
            };
        }
        if (isSortParameter(node) || isDeclareSortParameter(node) || isDeclareTypeVar(node)) {
            return { category: 'sort-parameter', signature: `sort parameter ${printSymbol(name)}`, overloads: [] };
        }
        return undefined;
    }

    private sortText(term: Term | undefined): string {
        if (!term) return '?';
        const sort: Sort = this.services.typing.SortChecker.sortOf(term);
        return sortToString(sort);
    }

    private datatypeConstructors(node: AstNode): string[] {
        if (isDeclareDatatype(node)) return node.datatype?.constructors.map(c => c.name) ?? [];
        if (isLegacyDatatypeDec(node)) return node.constructors.map(c => c.name);
        if (isSortDec(node) && isDeclareDatatypes(node.$container)) {
            const index = node.$container.sorts.indexOf(node);
            const dt = node.$container.datatypes[index];
            return isDatatypeDec(dt) ? dt.constructors.map(c => c.name) : [];
        }
        return [];
    }

    /** `;` comment lines directly above the command that contains the node. */
    leadingComment(node: AstNode): string | undefined {
        let command: AstNode = node;
        while (command.$container && command.$container.$type !== 'Script') command = command.$container;
        const cst = command.$cstNode;
        if (!cst) return undefined;
        const text = AstUtils.getDocument(command).textDocument.getText();
        const lines = text.slice(0, cst.offset).split('\n');
        lines.pop(); // the line the command starts on
        const comments: string[] = [];
        while (lines.length > 0) {
            const line = lines[lines.length - 1].trim();
            if (!line.startsWith(';')) break;
            comments.unshift(line.replace(/^;+\s?/, ''));
            lines.pop();
        }
        return comments.length > 0 ? comments.join('\n') : undefined;
    }

    /** Short detail text for completion items. */
    detail(node: AstNode): string | undefined {
        const description = this.describe(node);
        if (!description) return undefined;
        if (description.category === 'builtin-function') {
            const theory = description.theory ? ` — ${description.theory}` : '';
            return description.signature.replace(/^\S+: /, '') + (description.overloads.length > 0 ? ` (+${description.overloads.length})` : '') + theory;
        }
        if (description.category === 'builtin-sort') return description.theory;
        return description.signature;
    }

    static isFunctionSymbol(node: AstNode): node is FunctionSymbol {
        return isDeclareConst(node) || isDeclareFun(node) || isDefineConst(node) || isFunctionDef(node) || isFunctionDec(node)
            || isConstructorDec(node) || isSelectorDec(node) || isSortedVar(node) || isVarBinding(node) || isPatternVariable(node)
            || isNamedAttribute(node) || isDeclareRel(node) || isDeclareVar(node);
    }
}

/** Formats a builtin rank as an SMT-LIB-like signature line, e.g. `(bvadd (_ BitVec m) (_ BitVec m)+) : (_ BitVec m)`. */
export function formatRank(spec: BuiltinFunctionSpec, rankText: string): string {
    const head = spec.indices ? `(_ ${printSymbol(spec.name)} ${spec.indices.join(' ')})` : printSymbol(spec.name);
    let rank;
    try {
        rank = parseRank(rankText);
    } catch {
        return `${head} : ${rankText}`;
    }
    const args = rank.params.map((p, i) => sortToString(p) + (i === rank.params.length - 1 && rank.repeat ? rank.repeat : ''));
    const result = sortToString(rank.result);
    return args.length === 0 ? `${head} : ${result}` : `(${head} ${args.join(' ')}) : ${result}`;
}

export function isLocalBinder(node: AstNode): boolean {
    return isSortedVar(node) || isVarBinding(node) || isPatternVariable(node) || isLetTerm(node);
}
