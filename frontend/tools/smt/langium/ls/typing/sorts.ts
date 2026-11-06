/**
 * Sort terms, the builtin rank notation (see builtins/types.ts) and unification.
 */

/** A numeric index of a sort pattern: a constant, a variable or an arithmetic expression. */
export type IndexPattern =
    | { kind: 'num'; value: number }
    | { kind: 'nvar'; name: string }
    | { kind: 'expr'; expr: IndexExpr };

export type IndexExpr =
    | { op: 'num'; value: number }
    | { op: 'var'; name: string }
    | { op: '+' | '-' | '*'; left: IndexExpr; right: IndexExpr };

/**
 * A sort. Concrete sorts only use numeric indices; sort patterns of builtin ranks
 * may contain sort variables and index patterns.
 */
export type Sort =
    | { kind: 'sort'; name: string; indices: IndexPattern[]; args: Sort[] }
    | { kind: 'var'; name: string }
    | { kind: 'unknown' };

export const UNKNOWN: Sort = { kind: 'unknown' };

export function mkSort(name: string, args: Sort[] = [], indices: number[] = []): Sort {
    return { kind: 'sort', name, args, indices: indices.map(value => ({ kind: 'num', value })) };
}

export const BOOL = mkSort('Bool');
export const INT = mkSort('Int');
export const REAL = mkSort('Real');
export const STRING = mkSort('String');
export const REGLAN = mkSort('RegLan');
export const ROUNDING_MODE = mkSort('RoundingMode');
export const UNICODE = mkSort('Unicode');

export function bitVec(width: number): Sort {
    return mkSort('BitVec', [], [width]);
}

export function isKnown(sort: Sort): boolean {
    return sort.kind !== 'unknown';
}

/** True if the sort contains neither unknown parts nor sort variables. */
export function isGround(sort: Sort): boolean {
    if (sort.kind !== 'sort') return false;
    return sort.indices.every(i => i.kind === 'num') && sort.args.every(isGround);
}

export function sortToString(sort: Sort): string {
    switch (sort.kind) {
        case 'unknown': return '?';
        case 'var': return sort.name;
        case 'sort': {
            const name = printSymbol(sort.name);
            const head = sort.indices.length > 0
                ? `(_ ${name} ${sort.indices.map(indexToString).join(' ')})`
                : name;
            return sort.args.length > 0 ? `(${head} ${sort.args.map(sortToString).join(' ')})` : head;
        }
    }
}

function indexToString(index: IndexPattern): string {
    switch (index.kind) {
        case 'num': return String(index.value);
        case 'nvar': return index.name;
        case 'expr': return exprToString(index.expr);
    }
}

function exprToString(expr: IndexExpr): string {
    switch (expr.op) {
        case 'num': return String(expr.value);
        case 'var': return expr.name;
        default: return `${exprToString(expr.left)}${expr.op}${exprToString(expr.right)}`;
    }
}

const SIMPLE_SYMBOL = /^[a-zA-Z~!@$%^&*_\-+=<>.?/][a-zA-Z0-9~!@$%^&*_\-+=<>.?/]*$/;

/** Prints a symbol, quoting it with `|...|` if necessary. */
export function printSymbol(name: string): string {
    return SIMPLE_SYMBOL.test(name) ? name : `|${name}|`;
}

/******************************************************************************
 * Rank notation parser
 ******************************************************************************/

export interface Rank {
    params: Sort[];
    /** Repetition of the last parameter: '*' zero or more additional, '+' one or more. */
    repeat?: '*' | '+';
    result: Sort;
    /** Source text, used in messages. */
    text: string;
}

const rankCache = new Map<string, Rank>();

export function parseRank(text: string): Rank {
    let rank = rankCache.get(text);
    if (!rank) {
        rank = new RankParser(text).parseRank();
        rankCache.set(text, rank);
    }
    return rank;
}

/** Parses a sort written in rank notation, e.g. an alias like `(_ FloatingPoint 8 24)`. */
export function parseSortPattern(text: string): Sort {
    const parser = new RankParser(text);
    const sort = parser.parseSort();
    return sort;
}

class RankParser {
    private readonly tokens: string[];
    private pos = 0;

    constructor(private readonly text: string) {
        this.tokens = text.match(/\{[^}]*\}|->(?=\s|$|\))|[()]|[^\s()]+/g) ?? [];
    }

    parseRank(): Rank {
        const params: Sort[] = [];
        let repeat: '*' | '+' | undefined;
        while (this.peek() !== '->') {
            if (this.peek() === undefined) throw new Error(`Invalid rank '${this.text}': missing '->'`);
            if (repeat) throw new Error(`Invalid rank '${this.text}': repetition only allowed on the last argument`);
            const sort = this.parseSort();
            params.push(sort);
            const suffix = this.takeSuffix();
            if (suffix) repeat = suffix;
        }
        this.pos++; // '->'
        const result = this.parseSort();
        return { params, repeat, result, text: this.text };
    }

    parseSort(): Sort {
        const token = this.next();
        if (token === '(') {
            if (this.peek() === '_') {
                this.pos++;
                const name = this.next();
                const indices: IndexPattern[] = [];
                while (this.peek() !== ')') indices.push(this.parseIndex());
                this.pos++;
                return { kind: 'sort', name, indices, args: [] };
            }
            const head = this.parseSort();
            const args: Sort[] = [];
            while (this.peek() !== ')') args.push(this.parseSort());
            this.pos++;
            if (head.kind !== 'sort') throw new Error(`Invalid sort in '${this.text}'`);
            return { ...head, args };
        }
        if (token === undefined || token === ')') throw new Error(`Invalid sort in '${this.text}'`);
        // Repetition suffix attached to a name, e.g. `Int*`.
        let name = token;
        if (name.length > 1 && (name.endsWith('*') || name.endsWith('+'))) {
            this.pendingSuffix = name.slice(-1) as '*' | '+';
            name = name.slice(0, -1);
        }
        if (name === '?') return UNKNOWN;
        if (/^[A-Z]$/.test(name)) return { kind: 'var', name };
        return { kind: 'sort', name, indices: [], args: [] };
    }

    private pendingSuffix: '*' | '+' | undefined;

    private takeSuffix(): '*' | '+' | undefined {
        if (this.pendingSuffix) {
            const s = this.pendingSuffix;
            this.pendingSuffix = undefined;
            return s;
        }
        const next = this.peek();
        if (next === '*' || next === '+') {
            this.pos++;
            return next;
        }
        return undefined;
    }

    private parseIndex(): IndexPattern {
        const token = this.next();
        if (/^\d+$/.test(token)) return { kind: 'num', value: Number(token) };
        if (token.startsWith('{')) return { kind: 'expr', expr: parseExpr(token.slice(1, -1)) };
        return { kind: 'nvar', name: token };
    }

    private peek(): string | undefined {
        return this.tokens[this.pos];
    }

    private next(): string {
        return this.tokens[this.pos++];
    }
}

function parseExpr(text: string): IndexExpr {
    const tokens = text.match(/\d+|[a-zA-Z_][a-zA-Z0-9_]*|[-+*()]/g) ?? [];
    let pos = 0;
    const primary = (): IndexExpr => {
        const t = tokens[pos++];
        if (t === '(') {
            const e = sum();
            pos++;
            return e;
        }
        if (/^\d+$/.test(t)) return { op: 'num', value: Number(t) };
        return { op: 'var', name: t };
    };
    const product = (): IndexExpr => {
        let left = primary();
        while (tokens[pos] === '*') {
            pos++;
            left = { op: '*', left, right: primary() };
        }
        return left;
    };
    const sum = (): IndexExpr => {
        let left = product();
        while (tokens[pos] === '+' || tokens[pos] === '-') {
            const op = tokens[pos++] as '+' | '-';
            left = { op, left, right: product() };
        }
        return left;
    };
    return sum();
}

export function evalExpr(expr: IndexExpr, env: Map<string, number>): number | undefined {
    switch (expr.op) {
        case 'num': return expr.value;
        case 'var': return env.get(expr.name);
        default: {
            const l = evalExpr(expr.left, env);
            const r = evalExpr(expr.right, env);
            if (l === undefined || r === undefined) return undefined;
            return expr.op === '+' ? l + r : expr.op === '-' ? l - r : l * r;
        }
    }
}

/******************************************************************************
 * Normalization and unification
 ******************************************************************************/

/**
 * Normalizes Z3 sort aliases so that equal sorts compare equal:
 * `(-> A B)`, `(=> A B)` -> `(Array A B)`, `(Set X)` -> `(Array X Bool)`,
 * `(_ bv m)` -> `(_ BitVec m)`, `bool` -> `Bool`, `StringSequence` -> `String`,
 * `(Seq Unicode)` -> `String`, `(RegEx String)` -> `RegLan`.
 */
export function normalize(sort: Sort): Sort {
    if (sort.kind !== 'sort') return sort;
    const args = sort.args.map(normalize);
    switch (sort.name) {
        case '->':
        case '=>':
            return { kind: 'sort', name: 'Array', indices: [], args };
        case 'Set':
            if (args.length === 1) return { kind: 'sort', name: 'Array', indices: [], args: [args[0], BOOL] };
            break;
        case 'bv':
            return { kind: 'sort', name: 'BitVec', indices: sort.indices, args };
        case 'bool':
            return BOOL;
        case 'StringSequence':
            return STRING;
        case 'Seq':
            if (args.length === 1 && args[0].kind === 'sort' && args[0].name === 'Unicode') return STRING;
            break;
        case 'RegEx':
            if (args.length === 1 && args[0].kind === 'sort' && args[0].name === 'String') return REGLAN;
            break;
    }
    return { ...sort, args };
}

/** Sort and numeric variable bindings created while matching one rank. */
export class Substitution {
    readonly sorts = new Map<string, Sort>();
    readonly nums = new Map<string, number>();
    /** Index expressions that could not be evaluated yet; checked at the end. */
    readonly pending: Array<{ expr: IndexExpr; value: number }> = [];

    apply(sort: Sort): Sort {
        switch (sort.kind) {
            case 'unknown': return sort;
            case 'var': {
                const bound = this.sorts.get(sort.name);
                return bound ? bound : UNKNOWN;
            }
            case 'sort': {
                const indices: IndexPattern[] = sort.indices.map(index => {
                    if (index.kind === 'nvar') {
                        const v = this.nums.get(index.name);
                        return v === undefined ? index : { kind: 'num', value: v };
                    }
                    if (index.kind === 'expr') {
                        const v = evalExpr(index.expr, this.nums);
                        return v === undefined ? index : { kind: 'num', value: v };
                    }
                    return index;
                });
                if (indices.some(i => i.kind !== 'num')) {
                    // An index could not be determined: the sort is only partially known.
                    return UNKNOWN;
                }
                return normalize({ kind: 'sort', name: sort.name, indices, args: sort.args.map(a => this.apply(a)) });
            }
        }
    }

    checkPending(): boolean {
        return this.pending.every(p => {
            const v = evalExpr(p.expr, this.nums);
            return v === undefined || v === p.value;
        });
    }
}

export interface UnifyOptions {
    /** Allow an Int actual where a Real is expected (Z3 inserts to_real). */
    intToReal: boolean;
}

/**
 * Matches the sort pattern `pattern` (from a rank) against the actual sort `actual`,
 * extending `subst`. Unknown parts always match.
 */
export function unify(pattern: Sort, actual: Sort, subst: Substitution, options: UnifyOptions): boolean {
    if (pattern.kind === 'unknown' || actual.kind === 'unknown') return true;
    if (pattern.kind === 'var') {
        const bound = subst.sorts.get(pattern.name);
        if (!bound || bound.kind === 'unknown') {
            subst.sorts.set(pattern.name, actual);
            return true;
        }
        if (options.intToReal && isNamed(bound, 'Int') && isNamed(actual, 'Real')) {
            subst.sorts.set(pattern.name, actual);
            return true;
        }
        if (options.intToReal && isNamed(bound, 'Real') && isNamed(actual, 'Int')) return true;
        if (sortsCompatible(bound, actual)) {
            if (!isGround(bound) && isGround(actual)) subst.sorts.set(pattern.name, actual);
            return true;
        }
        return false;
    }
    if (actual.kind === 'var') {
        // A sort parameter of the user's script (declare-sort-parameter, par): accepted leniently.
        return true;
    }
    const p = normalize(pattern) as Extract<Sort, { kind: 'sort' }>;
    const a = normalize(actual) as Extract<Sort, { kind: 'sort' }>;
    if (p.kind !== 'sort' || a.kind !== 'sort') return true;
    if (p.name !== a.name) {
        if (options.intToReal && p.name === 'Real' && a.name === 'Int') return true;
        // String is (Seq Unicode) and RegLan is (RegEx String) in Z3.
        if (p.name === 'Seq' && a.name === 'String') return unify(p.args[0] ?? UNKNOWN, UNICODE, subst, options);
        if (p.name === 'String' && a.name === 'Seq') return unify(UNICODE, a.args[0] ?? UNKNOWN, subst, options);
        if (p.name === 'RegEx' && a.name === 'RegLan') return unify(p.args[0] ?? UNKNOWN, STRING, subst, options);
        if (p.name === 'RegLan' && a.name === 'RegEx') return unify(STRING, a.args[0] ?? UNKNOWN, subst, options);
        return false;
    }
    if (p.args.length !== a.args.length) return false;
    if (p.indices.length !== a.indices.length) return false;
    for (let i = 0; i < p.indices.length; i++) {
        const pi = p.indices[i];
        const ai = a.indices[i];
        if (ai.kind !== 'num') continue;
        if (pi.kind === 'num') {
            if (pi.value !== ai.value) return false;
        } else if (pi.kind === 'nvar') {
            const bound = subst.nums.get(pi.name);
            if (bound === undefined) subst.nums.set(pi.name, ai.value);
            else if (bound !== ai.value) return false;
        } else {
            const v = evalExpr(pi.expr, subst.nums);
            if (v === undefined) subst.pending.push({ expr: pi.expr, value: ai.value });
            else if (v !== ai.value) return false;
        }
    }
    // Arguments are invariant, so no Int/Real coercion inside sort arguments.
    const inner = { ...options, intToReal: false };
    for (let i = 0; i < p.args.length; i++) {
        if (!unify(p.args[i], a.args[i], subst, inner)) return false;
    }
    return true;
}

/** Structural compatibility of two (possibly partially unknown) sorts. */
export function sortsCompatible(expected: Sort, actual: Sort, options: UnifyOptions = { intToReal: false }): boolean {
    if (expected.kind === 'unknown' || actual.kind === 'unknown') return true;
    if (expected.kind === 'var' || actual.kind === 'var') {
        return expected.kind === 'var' && actual.kind === 'var' ? expected.name === actual.name : true;
    }
    return unify(expected, actual, new Substitution(), options);
}

export function isNamed(sort: Sort, name: string): boolean {
    return sort.kind === 'sort' && normalize(sort).kind === 'sort' && (normalize(sort) as { name: string }).name === name;
}

export function sortName(sort: Sort): string | undefined {
    if (sort.kind !== 'sort') return undefined;
    const n = normalize(sort);
    return n.kind === 'sort' ? n.name : undefined;
}

/** Replaces sort variables by the given sorts (used for define-sort expansion and datatype parameters). */
export function substituteVars(sort: Sort, map: Map<string, Sort>): Sort {
    switch (sort.kind) {
        case 'unknown': return sort;
        case 'var': return map.get(sort.name) ?? sort;
        case 'sort': return { ...sort, args: sort.args.map(a => substituteVars(a, map)) };
    }
}

/** Renames all sort variables with a unique suffix so that patterns of different declarations do not clash. */
export function freshen(sort: Sort, suffix: string): Sort {
    switch (sort.kind) {
        case 'unknown': return sort;
        case 'var': return { kind: 'var', name: sort.name + suffix };
        case 'sort': return { ...sort, args: sort.args.map(a => freshen(a, suffix)) };
    }
}

export function sortVariables(sort: Sort, into = new Set<string>()): Set<string> {
    if (sort.kind === 'var') into.add(sort.name);
    else if (sort.kind === 'sort') sort.args.forEach(a => sortVariables(a, into));
    return into;
}
