/**
 * Global symbol table of an SMT-LIB script.
 *
 * SMT-LIB scripts are executed command by command, so a global symbol is visible from
 * the point where it is declared until the assertion level it belongs to is popped
 * (or `reset` / `reset-assertions` removes it). The table records for every global
 * declaration the offset range in which it is visible:
 *
 *  - declarations become visible after their command, except where recursion is
 *    allowed: datatype sorts (within the declaring command), `define-fun-rec` and
 *    `define-funs-rec` function names (within their bodies);
 *  - `pop n` removes the declarations of the n most recent assertion levels;
 *  - `reset` removes everything; `reset-assertions` removes all declarations unless
 *    `:global-declarations` was set to true when they were made.
 */
import { AstUtils, type AstNode, type AstNodeDescription, type AstNodeDescriptionProvider, type LangiumDocument } from 'langium';
import {
    isDeclareConst, isDeclareDatatype, isDeclareDatatypes, isDeclareFun, isDeclareRel, isDeclareSort, isDeclareSortParameter,
    isDeclareTypeVar, isDeclareVar, isDefineConst, isDefineFun, isDefineFunsRec, isDefineSort, isNamedAttribute, isPop, isPush,
    isSExprSymbol, isSetOption, isSimpleCommand,
    type Command, type ConstructorDec, type DatatypeDec, type Script
} from '../generated/ast.js';

export type Namespace = 'function' | 'sort';

export interface GlobalSymbol {
    name: string;
    node: AstNode;
    namespace: Namespace;
    command: Command;
    /** First offset at which the symbol is visible. */
    from: number;
    /** Offset at which the symbol stops being visible (exclusive). */
    to: number;
    /** True if the declaration was made while `:global-declarations` was true. */
    permanent: boolean;
    description?: AstNodeDescription;
}

/** Problems with the assertion stack found while building the table. */
export interface StackProblem {
    command: Command;
    message: string;
}

export class SymbolTable {
    readonly symbols: GlobalSymbol[] = [];
    readonly stackProblems: StackProblem[] = [];
    private readonly byName = new Map<string, GlobalSymbol[]>();

    constructor(readonly document: LangiumDocument, private readonly descriptions: AstNodeDescriptionProvider) {
        this.build(document.parseResult.value as Script);
    }

    private build(script: Script): void {
        let globalDeclarations = false;
        let levels: GlobalSymbol[][] = [[]];
        const permanent: GlobalSymbol[] = [];

        for (const command of script.commands) {
            const range = command.$cstNode;
            if (!range) continue;
            const start = range.offset;
            const end = range.end;
            const add = (name: string | undefined, node: AstNode, namespace: Namespace, from: number) => {
                if (!name) return;
                const symbol: GlobalSymbol = { name, node, namespace, command, from, to: Infinity, permanent: globalDeclarations };
                this.symbols.push(symbol);
                (globalDeclarations ? permanent : levels[levels.length - 1]).push(symbol);
                const list = this.byName.get(name);
                if (list) list.push(symbol);
                else this.byName.set(name, [symbol]);
            };
            const addConstructors = (constructors: ConstructorDec[]) => {
                for (const ctor of constructors) {
                    add(ctor.name, ctor, 'function', end);
                    for (const sel of ctor.selectors) add(sel.name, sel, 'function', end);
                }
            };

            if (isDeclareConst(command) || isDeclareFun(command) || isDefineConst(command) || isDeclareRel(command) || isDeclareVar(command)) {
                add(command.name, command, 'function', end);
            } else if (isDefineFun(command)) {
                const def = command.definition;
                add(def.name, def, 'function', command.kind === 'define-fun-rec' ? def.body?.$cstNode?.offset ?? end : end);
            } else if (isDefineFunsRec(command)) {
                for (const dec of command.declarations) add(dec.name, dec, 'function', start);
            } else if (isDeclareSort(command) || isDeclareSortParameter(command) || isDeclareTypeVar(command) || isDefineSort(command)) {
                add(command.name, command, 'sort', end);
            } else if (isDeclareDatatype(command)) {
                add(command.name, command, 'sort', start);
                addConstructors(command.datatype?.constructors ?? []);
            } else if (isDeclareDatatypes(command)) {
                for (const sortDec of command.sorts) add(sortDec.name, sortDec, 'sort', start);
                for (const dt of command.legacyDatatypes) add(dt.name, dt, 'sort', start);
                command.datatypes.forEach((dt: DatatypeDec) => addConstructors(dt.constructors));
                command.legacyDatatypes.forEach(dt => addConstructors(dt.constructors));
            }

            // In-line definitions `(! t :named n)` anywhere in the command.
            for (const node of AstUtils.streamAst(command)) {
                if (isNamedAttribute(node)) add(node.name, node, 'function', end);
            }

            if (isPush(command)) {
                const n = command.levels !== undefined ? Number(command.levels) : 1;
                for (let k = 0; k < n; k++) levels.push([]);
            } else if (isPop(command)) {
                const n = command.levels !== undefined ? Number(command.levels) : 1;
                if (n > levels.length - 1) {
                    this.stackProblems.push({
                        command,
                        message: levels.length === 1
                            ? 'Cannot pop: the assertion stack has no pushed levels.'
                            : `Cannot pop ${n} levels: only ${levels.length - 1} level(s) have been pushed.`
                    });
                }
                for (let k = 0; k < n && levels.length > 1; k++) {
                    for (const symbol of levels.pop()!) symbol.to = start;
                }
            } else if (isSimpleCommand(command) && command.name === 'reset') {
                for (const symbol of [...permanent, ...levels.flat()]) symbol.to = start;
                permanent.length = 0;
                levels = [[]];
                globalDeclarations = false;
            } else if (isSimpleCommand(command) && command.name === 'reset-assertions') {
                // Declarations survive if :global-declarations is true when reset-assertions runs.
                if (!globalDeclarations) {
                    for (const symbol of levels.flat()) symbol.to = start;
                    levels = [[]];
                } else {
                    levels = [levels.flat()];
                }
            } else if (isSetOption(command) && (command.attribute?.keyword === ':global-declarations' || command.attribute?.keyword === ':global-decls')) {
                const value = command.attribute.value;
                globalDeclarations = isSExprSymbol(value) && value.value === 'true';
            }
        }
    }

    /** All visible global symbols with the given name, the most recently declared first. */
    lookup(name: string, namespace: Namespace, offset: number): GlobalSymbol[] {
        const list = this.byName.get(name);
        if (!list) return [];
        const result: GlobalSymbol[] = [];
        for (let i = list.length - 1; i >= 0; i--) {
            const s = list[i];
            if (s.namespace === namespace && s.from <= offset && offset < s.to) result.push(s);
        }
        return result;
    }

    /** All global symbols visible at the offset (latest declaration per name). */
    visibleAt(namespace: Namespace, offset: number): GlobalSymbol[] {
        const seen = new Set<string>();
        const result: GlobalSymbol[] = [];
        for (let i = this.symbols.length - 1; i >= 0; i--) {
            const s = this.symbols[i];
            if (s.namespace === namespace && s.from <= offset && offset < s.to && !seen.has(s.name)) {
                seen.add(s.name);
                result.push(s);
            }
        }
        return result;
    }

    /** All symbols with the given name and namespace regardless of visibility. */
    allNamed(name: string, namespace: Namespace): GlobalSymbol[] {
        return (this.byName.get(name) ?? []).filter(s => s.namespace === namespace);
    }

    describe(symbol: GlobalSymbol): AstNodeDescription {
        symbol.description ??= this.descriptions.createDescription(symbol.node, symbol.name, this.document);
        return symbol.description;
    }
}
