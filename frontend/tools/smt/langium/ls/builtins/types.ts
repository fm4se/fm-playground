/**
 * Data model of the builtin (theory) symbols known to the SMT-LIB language server.
 *
 * The catalog files (`catalog-*.ts`) only contain data in this format. The data drives
 * name resolution (every builtin name is resolvable without a declaration), hover,
 * completion and sort checking.
 *
 * RANK NOTATION (field `ranks` of {@link BuiltinFunctionSpec})
 * ------------------------------------------------------------
 *     RANK  ::= ARG* '->' SORT
 *     ARG   ::= SORT | SORT '*' | SORT '+'        ('*' / '+' only on the LAST argument)
 *     SORT  ::= NAME
 *             | '(' NAME SORT+ ')'                e.g. (Array X Y), (Seq A), (-> A B)
 *             | '(' '_' NAME IDX+ ')'             e.g. (_ BitVec m), (_ FloatingPoint eb sb)
 *             | '?'                               any sort (not checked)
 *     IDX   ::= NUMERAL | numvar | '{' EXPR '}'   EXPR uses numvars, numerals, + - * and ( )
 *
 *  - Single upper-case letters (A, B, X, Y, T, ...) are sort variables. They are unified
 *    across the arguments and the result of one rank.
 *  - Lower-case identifiers inside indexed sorts (m, n, i, j, eb, sb, ...) are numeric
 *    variables. They are unified across arguments as well. The names listed in the
 *    `indices` field of a function are bound to the numeric indices of the identifier,
 *    e.g. `(_ extract i j)` has `indices: ['i', 'j']` and rank
 *    `(_ BitVec m) -> (_ BitVec {i-j+1})`.
 *  - `S*` on the last argument means zero or more further arguments of sort S, `S+` one
 *    or more. Chainable / left-assoc / right-assoc / pairwise operators are written
 *    with these, e.g. `=` is `A A+ -> Bool`, `and` is `Bool* -> Bool`.
 *  - A constant has no arguments: `-> RoundingMode`.
 *  - Several ranks are overloads; the first matching rank wins.
 */

export interface BuiltinSortSpec {
    /** Sort symbol, e.g. `Int`, `Array`, `BitVec`. */
    name: string;
    /** Theory label shown to users, e.g. 'Core', 'FixedSizeBitVectors', 'Z3 Sequences'. */
    theory: string;
    /** Number of sort arguments, e.g. 0 for Int, 2 for Array, 1 for Seq. */
    arity: number;
    /** Names of the numeric indices for indexed sorts, e.g. ['m'] for `(_ BitVec m)`. */
    indices?: string[];
    /** For sort abbreviations: the sort they stand for, e.g. Float32 -> '(_ FloatingPoint 8 24)'. */
    alias?: string;
    /** Short user-facing documentation (1-3 sentences, plain text / markdown). */
    doc: string;
    /** True if the symbol is a Z3 extension and not part of an SMT-LIB standard theory. */
    z3Only?: boolean;
}

export interface BuiltinFunctionSpec {
    /** Function symbol, e.g. `bvadd`, `str.++`, `extract`. */
    name: string;
    /** Theory label shown to users. */
    theory: string;
    /**
     * Index names when the symbol is used as an indexed identifier `(_ name idx...)`.
     * Omit for plain symbols. Indices are numerals unless listed in `symbolIndices`.
     */
    indices?: string[];
    /** Indices (by name) that are symbols rather than numerals, e.g. `(_ is cons)`. */
    symbolIndices?: string[];
    /** Overloaded ranks in RANK NOTATION; see the file comment. */
    ranks: string[];
    /** Short user-facing documentation (1-3 sentences, plain text / markdown). */
    doc: string;
    /** True if the symbol is a Z3 extension and not part of an SMT-LIB standard theory. */
    z3Only?: boolean;
}
