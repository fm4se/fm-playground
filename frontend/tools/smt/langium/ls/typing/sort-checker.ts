/**
 * Sort inference and checking for SMT-LIB terms.
 *
 * The checker computes the sort of every term bottom-up, matching applications
 * against the ranks of builtin functions (see builtins/) and user declarations. It is
 * deliberately lenient: whenever a sort cannot be determined (unresolved symbol,
 * unsupported construct) the sort is "unknown" and matches everything, so that only
 * definite errors are reported. Like Z3, an Int argument is accepted where a Real is
 * expected.
 */
import { AstUtils, DocumentCache, type AstNode, type LangiumDocument } from 'langium';
import {
    isAnnotatedTerm, isApplication, isAssert, isBinaryConstant, isCheckSatAssuming, isConstructorDec, isConstructorPattern,
    isDatatypeDec, isDecimalConstant, isDeclareConst, isDeclareDatatype, isDeclareDatatypes, isDeclareFun, isDeclareRel,
    isDeclareSort, isDeclareSortParameter, isDeclareTypeVar, isDeclareVar, isDefineConst, isDefineFun, isDefineFunsRec,
    isDefineSort, isFixedpointRule, isFunctionDec, isFunctionDef, isHexadecimalConstant, isIndexedIdentifier, isIndexedSort,
    isLambdaTerm, isLegacyDatatypeDec, isLetTerm, isMatchTerm, isNamedAttribute, isNumeralConstant, isNumeralIndex,
    isBitVectorIndex, isParametricSort, isPatternAttribute, isPatternVariable, isQualifiedIdentifier, isQuantifiedTerm,
    isSelectorDec, isSimpleIdentifier, isSortDec, isSortParameter, isSortedVar, isStringConstant, isSymbolIndex,
    isTermCommand, isVarBinding, isObjective, isGetValue, isGetConsequences, isSetInitialValue,
    type ConstructorDec, type Identifier, type Index, type MatchTerm, type QualIdentifier,
    type Script, type Sort as AstSort, type SortIdentifier, type SortSymbol, type Term, type FunctionSymbol
} from '../generated/ast.js';
import type { BuiltinLibrary } from '../builtins/library.js';
import type { BuiltinFunctionSpec } from '../builtins/types.js';
import type { SmtServices } from '../smt-module.js';
import type { SmtScopeProvider } from '../scoping/smt-scope-provider.js';
import {
    BOOL, INT, REAL, STRING, UNKNOWN, Substitution, bitVec, freshen, isKnown, isNamed, mkSort, normalize, parseRank,
    parseSortPattern, sortName, sortToString, sortsCompatible, substituteVars, unify, type Rank, type Sort
} from './sorts.js';

export interface SortProblem {
    node: AstNode;
    property?: string;
    index?: number;
    message: string;
    severity: 'error' | 'warning';
}

export interface SortAnalysis {
    readonly problems: SortProblem[];
    sortOf(term: Term): Sort | undefined;
}

/** The signature of a function-like symbol: parameter sorts and result sort. */
export interface Signature {
    params: Sort[];
    result: Sort;
}

const COERCE = { intToReal: true };

export class SortChecker {

    protected readonly builtins: BuiltinLibrary;
    protected readonly scopeProvider: () => SmtScopeProvider;
    protected readonly cache: DocumentCache<string, SortAnalysis>;

    constructor(services: SmtServices) {
        this.builtins = services.builtins.BuiltinLibrary;
        this.scopeProvider = () => services.references.ScopeProvider as SmtScopeProvider;
        this.cache = new DocumentCache(services.shared);
    }

    /** Analyses the whole document once; results are cached until the document changes. */
    analyze(document: LangiumDocument): SortAnalysis {
        return this.cache.get(document.uri, 'analysis', () => new DocumentAnalysis(this, document).run());
    }

    /** Sort of a term, analysing its document if necessary. */
    sortOf(term: Term): Sort {
        return this.analyze(AstUtils.getDocument(term)).sortOf(term) ?? UNKNOWN;
    }

    /******************************************************************************
     * Sorts
     ******************************************************************************/

    /** Converts a sort expression of the syntax tree into a sort, expanding `define-sort`. */
    resolveSort(sort: AstSort | undefined, depth = 0): Sort {
        if (!sort || depth > 50) return UNKNOWN;
        if (isParametricSort(sort)) {
            const args = sort.arguments.map(a => this.resolveSort(a, depth + 1));
            return this.applySortSymbol(sort.identifier, args, depth);
        }
        return this.applySortSymbol(sort, [], depth);
    }

    protected applySortSymbol(identifier: SortIdentifier | undefined, args: Sort[], depth: number): Sort {
        if (!identifier) return UNKNOWN;
        const target = identifier.symbol?.ref;
        if (!target) return UNKNOWN;
        const indices = isIndexedSort(identifier) ? identifier.indices.map(indexValue) : [];
        if (indices.some(i => typeof i !== 'number')) return UNKNOWN;
        const numeric = indices as number[];
        if (this.builtins.isBuiltinNode(target)) {
            const spec = this.builtins.getSortSpec(target.name);
            if (spec?.alias && !spec.indices) return normalize(parseSortPattern(spec.alias));
            return normalize(mkSort(target.name, args, numeric));
        }
        if (isSortParameter(target) || isDeclareSortParameter(target) || isDeclareTypeVar(target)) {
            return { kind: 'var', name: target.name };
        }
        if (isDefineSort(target)) {
            const body = this.resolveSort(target.sort, depth + 1);
            const map = new Map<string, Sort>();
            target.parameters.forEach((p, i) => map.set(p.name, args[i] ?? UNKNOWN));
            return normalize(substituteVars(body, map));
        }
        if (isLegacyDatatypeDec(target) && args.length === 0 && isDeclareDatatypes(target.$container)) {
            // Z3 legacy syntax: inside the declaration, `Lst` stands for `(Lst T ...)`.
            return mkSort(target.name, target.$container.parameters.map(p => ({ kind: 'var', name: p.name }) as Sort));
        }
        return mkSort(target.name, args, numeric);
    }

    /** The sort declared by a datatype declaration, with its parameters as sort variables. */
    datatypeSortOf(ctor: ConstructorDec): Sort {
        const container = ctor.$container;
        if (isLegacyDatatypeDec(container)) {
            const params = isDeclareDatatypes(container.$container) ? container.$container.parameters : [];
            return mkSort(container.name, params.map(p => ({ kind: 'var', name: p.name })));
        }
        if (isDatatypeDec(container)) {
            const params = container.parameters.map(p => ({ kind: 'var', name: p.name }) as Sort);
            const command = container.$container;
            if (isDeclareDatatype(command)) return mkSort(command.name, params);
            if (isDeclareDatatypes(command)) {
                const index = command.datatypes.indexOf(container);
                const sortDec = command.sorts[index];
                return sortDec ? mkSort(sortDec.name, params) : UNKNOWN;
            }
        }
        return UNKNOWN;
    }

    /** Number of sort arguments a sort symbol expects, or undefined if not fixed. */
    sortArity(target: SortSymbol): { min: number; max: number } | undefined {
        if (this.builtins.isBuiltinNode(target)) {
            const spec = this.builtins.getSortSpec(target.name);
            if (!spec) return undefined;
            if (target.name === 'Array') return { min: 2, max: Infinity };
            return { min: spec.arity, max: spec.arity };
        }
        if (isDeclareSort(target)) {
            const n = target.arity !== undefined ? Number(target.arity) : 0;
            return { min: n, max: n };
        }
        if (isDefineSort(target)) return { min: target.parameters.length, max: target.parameters.length };
        if (isSortDec(target)) {
            const n = Number(target.arity);
            return { min: n, max: n };
        }
        if (isDeclareDatatype(target)) {
            const n = target.datatype?.parameters.length ?? 0;
            return { min: n, max: n };
        }
        if (isLegacyDatatypeDec(target)) {
            const n = isDeclareDatatypes(target.$container) ? target.$container.parameters.length : 0;
            return { min: n, max: n };
        }
        return { min: 0, max: 0 };
    }

    /******************************************************************************
     * Signatures of user declarations
     ******************************************************************************/

    /**
     * Signature of a user-declared function-like symbol. Returns undefined for builtins
     * (they have ranks) and for symbols whose sort depends on a term (let, :named, match),
     * which are handled by the analysis.
     */
    signatureOf(decl: FunctionSymbol): Signature | undefined {
        if (isDeclareConst(decl) || isDeclareVar(decl)) return { params: [], result: this.resolveSort(decl.sort) };
        if (isDefineConst(decl)) return { params: [], result: this.resolveSort(decl.sort) };
        if (isDeclareFun(decl)) return { params: decl.parameters.map(s => this.resolveSort(s)), result: this.resolveSort(decl.sort) };
        if (isDeclareRel(decl)) return { params: decl.parameters.map(s => this.resolveSort(s)), result: BOOL };
        if (isFunctionDef(decl) || isFunctionDec(decl)) {
            return { params: decl.parameters.map(p => this.resolveSort(p.sort)), result: this.resolveSort(decl.sort) };
        }
        if (isSortedVar(decl)) return { params: [], result: this.resolveSort(decl.sort) };
        if (isConstructorDec(decl)) {
            return { params: decl.selectors.map(s => this.resolveSort(s.sort)), result: this.datatypeSortOf(decl) };
        }
        if (isSelectorDec(decl)) {
            return { params: [this.datatypeSortOf(decl.$container)], result: this.resolveSort(decl.sort) };
        }
        return undefined;
    }

    signatureToString(name: string, signature: Signature): string {
        if (signature.params.length === 0) return sortToString(signature.result);
        return `(${signature.params.map(sortToString).join(' ')}) ${sortToString(signature.result)}`;
    }

    /**
     * True if a builtin function `name` accepts arguments of exactly these sorts, i.e. a
     * user declaration with this signature would collide with the builtin (Z3 rejects it).
     */
    builtinAccepts(name: string, params: Sort[]): BuiltinFunctionSpec | undefined {
        if (params.some(p => !isKnown(p))) return undefined;
        for (const spec of this.builtins.getFunctionSpecs(name, false)) {
            if (spec.indices) continue;
            for (const rankText of spec.ranks) {
                const rank = parseRank(rankText);
                if (!arityFits(rank, params.length)) continue;
                const subst = new Substitution();
                const ok = params.every((p, i) => {
                    const param = i < rank.params.length ? rank.params[i] : rank.params[rank.params.length - 1];
                    return isKnown(param) && unify(param, p, subst, { intToReal: false });
                });
                if (ok) return spec;
            }
        }
        return undefined;
    }

    getBuiltins(): BuiltinLibrary {
        return this.builtins;
    }

    getScopeProvider(): SmtScopeProvider {
        return this.scopeProvider();
    }
}

/** Value of an index: a number, a symbol, or undefined for unsupported index forms. */
export function indexValue(index: Index): number | string | undefined {
    if (isNumeralIndex(index)) return Number(index.value);
    if (isSymbolIndex(index)) return index.value;
    if (isBitVectorIndex(index)) {
        const v = index.value;
        return v.startsWith('#x') ? parseInt(v.slice(2), 16) : parseInt(v.slice(2), 2);
    }
    return undefined;
}

/**
 * One analysis run over a document.
 */
class DocumentAnalysis implements SortAnalysis {

    readonly problems: SortProblem[] = [];
    private readonly sorts = new Map<Term, Sort>();
    private readonly builtins: BuiltinLibrary;
    private freshCounter = 0;

    constructor(private readonly checker: SortChecker, private readonly document: LangiumDocument) {
        this.builtins = checker.getBuiltins();
    }

    sortOf(term: Term): Sort | undefined {
        return this.sorts.get(term);
    }

    run(): SortAnalysis {
        if (this.builtins.isBuiltinDocument(this.document)) return this;
        const script = this.document.parseResult.value as Script;
        for (const command of script.commands) {
            try {
                this.checkCommand(command);
            } catch (error) {
                // Never let a checker bug break validation of the whole document.
                if (error instanceof RangeError) continue;
                throw error;
            }
        }
        return this;
    }

    private checkCommand(command: Script['commands'][number]): void {
        if (isAssert(command)) {
            this.expect(this.infer(command.term), BOOL, command, 'term', 'Assertion');
        } else if (isCheckSatAssuming(command)) {
            command.assumptions.forEach((t, i) => this.expectAt(this.infer(t), BOOL, command, 'assumptions', i, 'Assumption'));
        } else if (isDefineFun(command)) {
            const def = command.definition;
            if (def?.body) this.expectAt(this.infer(def.body), this.checker.resolveSort(def.sort), def, 'body', undefined, `Body of '${def.name}'`);
        } else if (isDefineFunsRec(command)) {
            command.bodies.forEach((body, i) => {
                const dec = command.declarations[i];
                const sort = this.infer(body);
                if (dec) this.expectAt(sort, this.checker.resolveSort(dec.sort), command, 'bodies', i, `Body of '${dec.name}'`);
            });
        } else if (isDefineConst(command)) {
            if (command.value) this.expectAt(this.infer(command.value), this.checker.resolveSort(command.sort), command, 'value', undefined, `Value of '${command.name}'`);
        } else if (isTermCommand(command)) {
            // `(query R)` may name a relation without applying it.
            if (command.name === 'query' && isSimpleIdentifier(command.term)) return;
            const sort = this.infer(command.term);
            if (command.name === 'assert-soft') this.expect(sort, BOOL, command, 'term', 'Soft assertion');
        } else if (isFixedpointRule(command)) {
            this.expect(this.infer(command.term), BOOL, command, 'term', 'Rule');
        } else if (isObjective(command)) {
            const sort = this.infer(command.term);
            const name = sortName(sort);
            if (name && !['Int', 'Real', 'BitVec'].includes(name)) {
                this.report(command, `Objective must be of sort Int, Real or a bit-vector, found ${sortToString(sort)}.`, 'term');
            }
        } else if (isGetValue(command)) {
            command.terms.forEach(t => this.infer(t));
        } else if (isGetConsequences(command)) {
            command.assumptions.forEach((t, i) => this.expectAt(this.infer(t), BOOL, command, 'assumptions', i, 'Assumption'));
            command.variables.forEach(t => this.infer(t));
        } else if (isSetInitialValue(command)) {
            const a = this.infer(command.variable);
            const b = this.infer(command.value);
            if (!sortsCompatible(a, b, COERCE)) this.report(command, `Initial value of sort ${sortToString(b)} does not match the variable's sort ${sortToString(a)}.`, 'value');
        }
    }

    /******************************************************************************
     * Inference
     ******************************************************************************/

    infer(term: Term | undefined): Sort {
        if (!term) return UNKNOWN;
        const cached = this.sorts.get(term);
        if (cached) return cached;
        const sort = this.doInfer(term);
        this.sorts.set(term, sort);
        return sort;
    }

    private doInfer(term: Term): Sort {
        if (isNumeralConstant(term)) return INT;
        if (isDecimalConstant(term)) return REAL;
        if (isHexadecimalConstant(term)) return bitVec((term.value.length - 2) * 4);
        if (isBinaryConstant(term)) return bitVec(term.value.length - 2);
        if (isStringConstant(term)) return STRING;
        if (isSimpleIdentifier(term) || isIndexedIdentifier(term) || isQualifiedIdentifier(term)) {
            return this.inferApplication(term, term, []);
        }
        if (isApplication(term)) {
            const args = term.arguments.map(a => this.infer(a));
            return this.inferApplication(term, term.function, args);
        }
        if (isLetTerm(term)) {
            term.bindings.forEach(b => this.infer(b.value));
            return this.infer(term.body);
        }
        if (isQuantifiedTerm(term)) {
            this.expect(this.infer(term.body), BOOL, term, 'body', 'Quantifier body');
            return BOOL;
        }
        if (isLambdaTerm(term)) {
            const body = this.infer(term.body);
            // Z3 represents lambdas as arrays; SMT-LIB 2.7 as (-> ...), which normalizes to Array.
            return mkSort('Array', [...term.variables.map(v => this.checker.resolveSort(v.sort)), body]);
        }
        if (isMatchTerm(term)) return this.inferMatch(term);
        if (isAnnotatedTerm(term)) {
            const sort = this.infer(term.term);
            for (const attribute of term.attributes) {
                if (!isPatternAttribute(attribute)) continue;
                const [first, ...rest] = attribute.terms;
                if (attribute.key === ':pattern' && isSimpleIdentifier(first) && rest.length > 0) {
                    // Z3 reads `:pattern (f x y)` (no inner parentheses) as the single pattern `(f x y)`.
                    const args = rest.map(t => this.infer(t));
                    this.sorts.set(first, this.inferApplication(first, first, args));
                } else {
                    attribute.terms.forEach(t => this.infer(t));
                }
            }
            return sort;
        }
        return UNKNOWN;
    }

    private inferMatch(term: MatchTerm): Sort {
        const matched = this.infer(term.term);
        let result: Sort = UNKNOWN;
        term.cases.forEach((matchCase, i) => {
            const pattern = matchCase.pattern;
            if (isConstructorPattern(pattern)) {
                const ctor = pattern.constructorSymbol?.ref;
                if (ctor && isConstructorDec(ctor)) {
                    if (ctor.selectors.length !== pattern.arguments.length) {
                        this.report(pattern, `Constructor '${ctor.name}' has ${ctor.selectors.length} field(s), but the pattern binds ${pattern.arguments.length}.`, 'arguments');
                    }
                    const dtSort = this.checker.datatypeSortOf(ctor);
                    if (!sortsCompatible(dtSort, matched)) {
                        this.report(pattern, `Constructor '${ctor.name}' does not belong to the matched sort ${sortToString(matched)}.`, 'constructorSymbol');
                    }
                } else if (ctor) {
                    this.report(pattern, `'${pattern.constructorSymbol.$refText}' is not a datatype constructor.`, 'constructorSymbol');
                }
            }
            const body = this.infer(matchCase.body);
            if (!isKnown(result)) result = body;
            else if (!sortsCompatible(result, body, COERCE)) {
                this.report(matchCase, `All cases of 'match' must have the same sort; expected ${sortToString(result)}, found ${sortToString(body)}.`, 'body');
            }
            void i;
        });
        return result;
    }

    /** Sort of the variable bound by a match pattern. */
    patternVariableSort(variable: AstNode): Sort {
        if (!isPatternVariable(variable)) return UNKNOWN;
        const container = variable.$container;
        const matchCase = isConstructorPattern(container) ? container.$container : container;
        const matchTerm = matchCase.$container;
        const matched = this.infer(matchTerm.term);
        if (!isConstructorPattern(container)) return matched;
        const ctor = container.constructorSymbol?.ref;
        if (!ctor || !isConstructorDec(ctor)) return UNKNOWN;
        const index = container.arguments.indexOf(variable);
        const selector = ctor.selectors[index];
        if (!selector) return UNKNOWN;
        // Instantiate the datatype parameters with the arguments of the matched sort.
        const subst = new Substitution();
        unify(this.checker.datatypeSortOf(ctor), matched, subst, { intToReal: false });
        return subst.apply(this.checker.resolveSort(selector.sort));
    }

    /**
     * Sort of an application `(head args...)` or, with no arguments, of the identifier
     * `head` used as a term. `node` is the term the diagnostics are attached to.
     */
    private inferApplication(node: Term, head: QualIdentifier | undefined, args: Sort[]): Sort {
        if (!head) return UNKNOWN;
        let expected: Sort | undefined;
        let identifier: Identifier | undefined;
        if (isQualifiedIdentifier(head)) {
            expected = this.checker.resolveSort(head.sort);
            identifier = head.identifier;
        } else {
            identifier = head;
        }
        if (!identifier) return UNKNOWN;
        const reference = identifier.symbol;
        const target = reference?.ref;
        if (!target) return expected ?? UNKNOWN;
        const name = reference.$refText;
        const indices = isIndexedIdentifier(identifier) ? identifier.indices : [];
        const property = node === head ? undefined : 'function';
        let result: Sort;
        if (this.builtins.isBuiltinNode(target)) {
            result = this.checkBuiltin(node, property, name, indices, isIndexedIdentifier(identifier), args, expected);
        } else {
            const mark = this.problems.length;
            result = this.checkUser(node, property, name, target, args, expected);
            // Z3 overloads user functions by argument sorts: try the other visible declarations.
            if (this.problems.length > mark) {
                const offset = identifier.$cstNode?.offset ?? 0;
                const table = this.checker.getScopeProvider().getSymbolTable(this.document);
                for (const overload of table.lookup(name, 'function', offset)) {
                    if (overload.node === target) continue;
                    const failed = this.problems.splice(mark);
                    const alternative = this.checkUser(node, property, name, overload.node as FunctionSymbol, args, expected);
                    if (this.problems.length === mark) {
                        result = alternative;
                        break;
                    }
                    this.problems.splice(mark);
                    this.problems.push(...failed);
                }
            }
            // Z3 also overloads user declarations with builtins of the same name; fall back to the builtin.
            if (this.problems.length > mark && this.builtins.getFunctionSpecs(name).length > 0) {
                const userProblems = this.problems.splice(mark);
                const builtinResult = this.checkBuiltin(node, property, name, indices, isIndexedIdentifier(identifier), args, expected);
                if (this.problems.length > mark) {
                    this.problems.splice(mark);
                    this.problems.push(...userProblems);
                } else {
                    result = builtinResult;
                }
            }
        }
        if (expected && isKnown(expected)) {
            if (isKnown(result) && !sortsCompatible(expected, result, COERCE)) {
                this.report(node, `'${name}' has sort ${sortToString(result)}, which does not match the qualified sort ${sortToString(expected)}.`, property);
            }
            return expected;
        }
        return result;
    }

    private checkUser(node: Term, property: string | undefined, name: string, target: FunctionSymbol, args: Sort[], expected: Sort | undefined): Sort {
        // Z3 tester `is-C` resolves to the constructor `C`.
        if (isConstructorDec(target) && name !== target.name && name === `is-${target.name}`) {
            if (args.length !== 1) {
                this.report(node, `Tester '${name}' expects 1 argument but got ${args.length}.`, property);
                return BOOL;
            }
            const dt = this.checker.datatypeSortOf(target);
            if (!sortsCompatible(dt, args[0])) this.report(node, `Tester '${name}' expects an argument of sort ${sortToString(dt)}, got ${sortToString(args[0])}.`, property);
            return BOOL;
        }
        const signature = this.userSignature(target);
        if (!signature) return UNKNOWN;
        if (signature.params.length === 0 && args.length > 0) {
            // Applying a constant: Z3 treats array-valued (and SMT-LIB 2.7 function-valued) constants like functions.
            return this.applyArray(node, property, name, signature.result, args);
        }
        if (signature.params.length !== args.length) {
            this.report(node, args.length === 0
                ? `'${name}' is a function of ${signature.params.length} argument(s) and cannot be used as a constant.`
                : `'${name}' expects ${signature.params.length} argument(s) but got ${args.length}.`, property);
            return signature.result;
        }
        // Datatype constructors and selectors may be polymorphic: treat parameters as variables.
        const suffix = `'${++this.freshCounter}`;
        const params = signature.params.map(p => freshen(p, suffix));
        const subst = new Substitution();
        if (expected) unify(freshen(signature.result, suffix), expected, subst, { intToReal: false });
        for (let i = 0; i < args.length; i++) {
            if (!unify(params[i], args[i], subst, COERCE)) {
                this.report(node, `Argument ${i + 1} of '${name}' has sort ${sortToString(args[i])}, expected ${sortToString(subst.apply(params[i]) ?? params[i])}.`, property);
                return this.applyLenient(signature.result, suffix, subst);
            }
        }
        return this.applyLenient(signature.result, suffix, subst);
    }

    private applyLenient(result: Sort, suffix: string, subst: Substitution): Sort {
        const fresh = freshen(result, suffix);
        return fresh.kind === 'var' && !subst.sorts.has(fresh.name) ? UNKNOWN : substituteKnown(fresh, subst);
    }

    private userSignature(target: FunctionSymbol): { params: Sort[]; result: Sort } | undefined {
        if (isVarBinding(target)) return { params: [], result: this.infer(target.value) };
        if (isNamedAttribute(target)) {
            const annotated = target.$container;
            return { params: [], result: isAnnotatedTerm(annotated) ? this.infer(annotated.term) : UNKNOWN };
        }
        if (isPatternVariable(target)) return { params: [], result: this.patternVariableSort(target) };
        return this.checker.signatureOf(target);
    }

    /** `(a i1 ... in)` where `a` is an array: Z3 reads it as `select`. */
    private applyArray(node: Term, property: string | undefined, name: string, sort: Sort, args: Sort[]): Sort {
        if (!isKnown(sort)) return UNKNOWN;
        if (!isNamed(sort, 'Array') || sort.kind !== 'sort') {
            this.report(node, `'${name}' is a constant of sort ${sortToString(sort)} and cannot be applied to arguments.`, property);
            return UNKNOWN;
        }
        return this.selectFrom(node, property, name, normalize(sort), args);
    }

    private selectFrom(node: Term, property: string | undefined, name: string, array: Sort, indexSorts: Sort[]): Sort {
        if (array.kind !== 'sort') return UNKNOWN;
        const domain = array.args.slice(0, -1);
        const range = array.args[array.args.length - 1] ?? UNKNOWN;
        if (domain.length !== indexSorts.length) {
            this.report(node, `'${name}' expects ${domain.length} index argument(s) for an array of sort ${sortToString(array)}, got ${indexSorts.length}.`, property);
            return range;
        }
        domain.forEach((d, i) => {
            if (!sortsCompatible(d, indexSorts[i], COERCE)) {
                this.report(node, `Index ${i + 1} has sort ${sortToString(indexSorts[i])}, expected ${sortToString(d)}.`, property);
            }
        });
        return range;
    }

    /******************************************************************************
     * Builtins
     ******************************************************************************/

    private checkBuiltin(node: Term, property: string | undefined, name: string, indexNodes: Index[], indexed: boolean, args: Sort[], expected: Sort | undefined): Sort {
        const canonical = this.builtins.canonicalFunctionName(name);
        // Special forms whose sorts are not expressible as ranks.
        switch (canonical) {
            case 'select':
                if (args.length >= 2 && isNamed(args[0], 'Array')) return this.selectFrom(node, property, name, normalize(args[0]), args.slice(1));
                break;
            case 'store':
                if (args.length >= 3 && isNamed(args[0], 'Array')) {
                    const array = normalize(args[0]);
                    const range = this.selectFrom(node, property, name, array, args.slice(1, -1));
                    if (!sortsCompatible(range, args[args.length - 1], COERCE)) {
                        this.report(node, `Stored value has sort ${sortToString(args[args.length - 1])}, expected ${sortToString(range)}.`, property);
                    }
                    return array;
                }
                break;
            case 'const':
                if (expected && isNamed(expected, 'Array') && args.length === 1) {
                    const array = normalize(expected);
                    const range = array.kind === 'sort' ? array.args[array.args.length - 1] : UNKNOWN;
                    if (!sortsCompatible(range ?? UNKNOWN, args[0], COERCE)) {
                        this.report(node, `Constant array value has sort ${sortToString(args[0])}, expected ${sortToString(range ?? UNKNOWN)}.`, property);
                    }
                    return array;
                }
                break;
            case 'root-obj':
            case 'map':
            case 'as-array':
            case 'is':
            case 'update-field':
                if (canonical === 'is') {
                    if (args.length !== 1) this.report(node, `Tester '(_ is ...)' expects 1 argument but got ${args.length}.`, property);
                    return BOOL;
                }
                return UNKNOWN;
        }

        const specs = this.builtins.getFunctionSpecs(name, indexed);
        if (specs.length === 0) return UNKNOWN;
        const indices = indexNodes.map(indexValue);
        const candidates = specs.filter(s => indexed ? s.indices !== undefined : s.indices === undefined);
        const usable = candidates.length > 0 ? candidates : specs;

        if (indexed) {
            const counts = usable.map(s => s.indices ?? []);
            const ok = counts.some(c => c.some(n => n.endsWith('...')) ? indices.length >= c.length - 1 : c.length === indices.length);
            if (!ok) {
                const expectedCount = counts.map(c => c.length).join(' or ');
                this.report(node, `'${name}' expects ${expectedCount} index(es) but got ${indices.length}.`, property);
                return UNKNOWN;
            }
        } else if (usable.every(s => s.indices !== undefined)) {
            this.report(node, `'${name}' is an indexed identifier and must be written as (_ ${name} ...).`, property);
            return UNKNOWN;
        }

        const tried: Rank[] = [];
        let arityMatched: { rank: Rank; spec: BuiltinFunctionSpec } | undefined;
        for (const spec of usable) {
            for (const rankText of spec.ranks) {
                const rank = parseRank(rankText);
                tried.push(rank);
                if (!arityFits(rank, args.length)) continue;
                arityMatched ??= { rank, spec };
                const subst = this.bindIndices(spec, indices);
                if (expected && isKnown(expected) && !unify(rank.result, expected, subst, { intToReal: false })) continue;
                if (this.matchArgs(rank, args, subst) < 0 && subst.checkPending()) {
                    return subst.apply(rank.result);
                }
            }
        }
        if (tried.length === 0) return UNKNOWN;
        if (!arityMatched) {
            const counts = [...new Set(tried.map(r => describeArity(r)))].join(' or ');
            this.report(node, args.length === 0
                ? `'${name}' is a function of ${counts} argument(s) and cannot be used as a constant.`
                : `'${name}' expects ${counts} argument(s) but got ${args.length}.`, property);
            return this.commonResult(tried);
        }
        const fitting = tried.filter(r => arityFits(r, args.length));
        if (fitting.length === 1) {
            const { rank, spec } = arityMatched;
            const subst = this.bindIndices(spec, indices);
            const bad = this.matchArgs(rank, args, subst);
            if (bad >= 0) {
                const param = rank.params[Math.min(bad, rank.params.length - 1)];
                const shown = subst.apply(param);
                this.report(node, `Argument ${bad + 1} of '${name}' has sort ${sortToString(args[bad])}, expected ${sortToString(isKnown(shown) ? shown : param)}.`, property);
            } else {
                this.report(node, `Arguments of '${name}' have incompatible sizes: ${args.map(sortToString).join(', ')} (expected ${rank.text}).`, property);
            }
            return this.commonResult(fitting);
        }
        this.report(node, `No signature of '${name}' accepts arguments of sorts (${args.map(sortToString).join(' ')}). Expected one of: ${fitting.map(r => r.text).join('; ')}.`, property);
        return this.commonResult(fitting);
    }

    private bindIndices(spec: BuiltinFunctionSpec, indices: Array<number | string | undefined>): Substitution {
        const subst = new Substitution();
        (spec.indices ?? []).forEach((name, i) => {
            const value = indices[i];
            if (typeof value === 'number' && !name.endsWith('...')) subst.nums.set(name, value);
        });
        return subst;
    }

    /** Matches arguments against a rank; returns the index of the first mismatch or -1. */
    private matchArgs(rank: Rank, args: Sort[], subst: Substitution): number {
        for (let i = 0; i < args.length; i++) {
            const param = i < rank.params.length ? rank.params[i] : rank.params[rank.params.length - 1];
            if (!unify(param, args[i], subst, COERCE)) return i;
        }
        return -1;
    }

    /** If all candidate ranks agree on a ground result sort, it is used to continue checking. */
    private commonResult(ranks: Rank[]): Sort {
        const results = ranks.map(r => r.result);
        const first = results[0];
        if (first && first.kind === 'sort' && first.indices.length === 0 && first.args.length === 0
            && results.every(r => r.kind === 'sort' && r.name === first.name && r.args.length === 0 && r.indices.length === 0)) {
            return first;
        }
        return UNKNOWN;
    }

    /******************************************************************************
     * Reporting
     ******************************************************************************/

    private expect(actual: Sort, expected: Sort, node: AstNode, property: string, what: string): void {
        this.expectAt(actual, expected, node, property, undefined, what);
    }

    private expectAt(actual: Sort, expected: Sort, node: AstNode, property: string, index: number | undefined, what: string): void {
        if (!isKnown(actual) || !isKnown(expected)) return;
        if (!sortsCompatible(expected, actual, COERCE)) {
            this.problems.push({
                node, property, index, severity: 'error',
                message: `${what} must be of sort ${sortToString(expected)}, but has sort ${sortToString(actual)}.`
            });
        }
    }

    private report(node: AstNode, message: string, property?: string): void {
        this.problems.push({ node, property, message, severity: 'error' });
    }
}

function arityFits(rank: Rank, count: number): boolean {
    const n = rank.params.length;
    if (rank.repeat === '*') return count >= n - 1;
    if (rank.repeat === '+') return count >= n;
    return count === n;
}

function describeArity(rank: Rank): string {
    const n = rank.params.length;
    if (rank.repeat === '*') return `at least ${n - 1}`;
    if (rank.repeat === '+') return `at least ${n}`;
    return String(n);
}

/** Applies a substitution but keeps unbound variables as unknown parts. */
function substituteKnown(sort: Sort, subst: Substitution): Sort {
    if (sort.kind === 'var') return subst.sorts.get(sort.name) ?? UNKNOWN;
    if (sort.kind !== 'sort') return sort;
    return normalize({ ...sort, args: sort.args.map(a => substituteKnown(a, subst)) });
}

