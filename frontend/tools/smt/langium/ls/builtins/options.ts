/**
 * Options, info flags, set-info attributes and logics (SMT-LIB 2.7 and Z3).
 */
import { z3Params, type Z3ParamType } from './z3-params.js';

export type OptionValueType = Z3ParamType | 'numeral' | 'any';

export interface OptionSpec {
    /** Without the leading ':'. */
    name: string;
    type: OptionValueType;
    doc: string;
    defaultValue?: string;
    standard: boolean;
}

const standardOptions: OptionSpec[] = [
    { name: 'diagnostic-output-channel', type: 'string', standard: true, defaultValue: '"stderr"', doc: 'Output channel for diagnostic messages, a file name or `"stdout"`/`"stderr"`.' },
    { name: 'global-declarations', type: 'bool', standard: true, defaultValue: 'false', doc: 'If true, all declarations and definitions are global: they survive `pop` and `reset-assertions`.' },
    { name: 'interactive-mode', type: 'bool', standard: true, defaultValue: 'false', doc: 'Deprecated alias of `:produce-assertions`.' },
    { name: 'print-success', type: 'bool', standard: true, defaultValue: 'false', doc: 'If true, the solver prints `success` after each command that succeeds without other output.' },
    { name: 'produce-assertions', type: 'bool', standard: true, defaultValue: 'false', doc: 'Enables `get-assertions`.' },
    { name: 'produce-assignments', type: 'bool', standard: true, defaultValue: 'false', doc: 'Enables `get-assignment`.' },
    { name: 'produce-models', type: 'bool', standard: true, defaultValue: 'false', doc: 'Enables `get-model` and `get-value`.' },
    { name: 'produce-proofs', type: 'bool', standard: true, defaultValue: 'false', doc: 'Enables `get-proof`.' },
    { name: 'produce-unsat-assumptions', type: 'bool', standard: true, defaultValue: 'false', doc: 'Enables `get-unsat-assumptions`.' },
    { name: 'produce-unsat-cores', type: 'bool', standard: true, defaultValue: 'false', doc: 'Enables `get-unsat-core`.' },
    { name: 'random-seed', type: 'numeral', standard: true, defaultValue: '0', doc: 'Seed for the solver\'s pseudo-random number generator.' },
    { name: 'regular-output-channel', type: 'string', standard: true, defaultValue: '"stdout"', doc: 'Output channel for regular output.' },
    { name: 'reproducible-resource-limit', type: 'numeral', standard: true, defaultValue: '0', doc: 'Solver-specific resource limit for each check; 0 means no limit.' },
    { name: 'verbosity', type: 'numeral', standard: true, doc: 'Verbosity level of diagnostic output.' },
    // Z3 command-level options (cmd_context/basic_cmds.cpp)
    { name: 'global-decls', type: 'bool', standard: false, defaultValue: 'false', doc: 'Z3 alias of `:global-declarations`.' },
    { name: 'print-warning', type: 'bool', standard: false, defaultValue: 'true', doc: 'Z3: print warnings.' },
    { name: 'expand-definitions', type: 'bool', standard: false, defaultValue: 'false', doc: 'Removed from SMT-LIB 2.5; accepted by Z3 for compatibility.' },
    { name: 'numeral-as-real', type: 'bool', standard: false, defaultValue: 'false', doc: 'Z3: treat numerals as reals.' },
    { name: 'error-behavior', type: 'symbol', standard: false, defaultValue: 'immediate-exit', doc: 'Z3: `immediate-exit` or `continued-execution` after an error.' },
    { name: 'int-real-coercions', type: 'bool', standard: false, defaultValue: 'true', doc: 'Z3: automatically coerce integers to reals where needed.' },
];

let optionIndex: Map<string, OptionSpec> | undefined;

/** Z3 treats '-' and '_' in parameter names alike and is case-insensitive. */
export function normalizeOptionName(name: string): string {
    return name.replace(/^:/, '').toLowerCase().replace(/-/g, '_');
}

function getOptionIndex(): Map<string, OptionSpec> {
    if (!optionIndex) {
        optionIndex = new Map();
        for (const o of standardOptions) optionIndex.set(normalizeOptionName(o.name), o);
        for (const [name, type, defaultValue, doc] of z3Params) {
            const key = normalizeOptionName(name);
            if (!optionIndex.has(key)) optionIndex.set(key, { name, type, defaultValue, doc, standard: false });
        }
    }
    return optionIndex;
}

export function findOption(keyword: string): OptionSpec | undefined {
    return getOptionIndex().get(normalizeOptionName(keyword));
}

export function allOptions(): OptionSpec[] {
    return [...getOptionIndex().values()];
}

export interface KeywordSpec {
    name: string;
    doc: string;
}

/** Flags of `get-info`. */
export const infoFlags: KeywordSpec[] = [
    { name: 'all-statistics', doc: 'All statistics collected by the solver.' },
    { name: 'assertion-stack-levels', doc: 'Number of assertion levels on the assertion stack.' },
    { name: 'authors', doc: 'Authors of the solver.' },
    { name: 'error-behavior', doc: 'Whether the solver exits (`immediate-exit`) or continues (`continued-execution`) after an error.' },
    { name: 'name', doc: 'Name of the solver.' },
    { name: 'reason-unknown', doc: 'Why the last check returned `unknown`: `memout`, `incomplete` or a solver-specific reason.' },
    { name: 'version', doc: 'Version of the solver.' },
    // Z3
    { name: 'rlimit', doc: 'Z3: resource units consumed so far.' },
    { name: 'memory', doc: 'Z3: memory currently used.' },
    { name: 'time', doc: 'Z3: time spent so far.' },
];

/** Attributes of `set-info`. */
export const infoAttributes: KeywordSpec[] = [
    { name: 'smt-lib-version', doc: 'The SMT-LIB version of the script, e.g. `2.7`.' },
    { name: 'source', doc: 'Origin of the benchmark, usually a quoted symbol `|...|`.' },
    { name: 'status', doc: 'Expected result: `sat`, `unsat` or `unknown`.' },
    { name: 'license', doc: 'License of the benchmark, a string.' },
    { name: 'category', doc: 'Benchmark category: `"crafted"`, `"random"`, `"industrial"`.' },
    { name: 'notes', doc: 'Free-form notes, a string.' },
    { name: 'difficulty', doc: 'Benchmark difficulty.' },
];

export const STATUS_VALUES = ['sat', 'unsat', 'unknown'];

/** SMT-LIB logics plus logics accepted by Z3. */
export const logics: KeywordSpec[] = [
    { name: 'ALL', doc: 'The most general logic supported by the solver.' },
    ...[
        'AUFLIA', 'AUFLIRA', 'AUFNIRA', 'BV', 'LIA', 'LRA', 'NIA', 'NRA', 'LIRA', 'NIRA', 'UF', 'UFBV', 'UFIDL', 'UFLIA', 'UFLRA',
        'UFNIA', 'UFNRA', 'UFDT', 'UFDTLIA', 'UFDTLIRA', 'UFDTNIA', 'UFDTNIRA', 'UFFPDTLIRA', 'UFFPDTNIRA', 'ABV', 'ABVFP', 'ABVFPLRA',
        'ALIA', 'ANIA', 'AUFBV', 'AUFBVDTLIA', 'AUFBVDTNIA', 'AUFBVDTNIRA', 'AUFBVFP', 'AUFDTLIA', 'AUFDTLIRA', 'AUFDTNIRA', 'AUFFPDTLIRA',
        'AUFFPDTNIRA', 'BVFP', 'BVFPLRA', 'FP', 'FPLRA', 'UFBVDT', 'UFBVFP', 'UFBVLIA', 'UFFP', 'UFLIRA', 'UFNIRA', 'DT',
        'QF_ABV', 'QF_ABVFP', 'QF_ABVFPLRA', 'QF_ALIA', 'QF_ANIA', 'QF_AUFBV', 'QF_AUFBVFP', 'QF_AUFLIA', 'QF_AUFNIA', 'QF_AX',
        'QF_BV', 'QF_BVFP', 'QF_BVFPLRA', 'QF_DT', 'QF_FP', 'QF_FPLRA', 'QF_IDL', 'QF_LIA', 'QF_LIRA', 'QF_LRA', 'QF_NIA', 'QF_NIRA',
        'QF_NRA', 'QF_RDL', 'QF_S', 'QF_SLIA', 'QF_SNIA', 'QF_UF', 'QF_UFBV', 'QF_UFBVDT', 'QF_UFDT', 'QF_UFDTLIA', 'QF_UFDTLIRA',
        'QF_UFDTNIA', 'QF_UFFP', 'QF_UFFPDTLIRA', 'QF_UFFPDTNIRA', 'QF_UFIDL', 'QF_UFLIA', 'QF_UFLRA', 'QF_UFNIA', 'QF_UFNRA',
        'QF_UFNIRA', 'QF_UFBVLIA', 'QF_AUFLIRA', 'QF_SEQ', 'QF_ANUM', 'QF_FD', 'QF_LIAFP', 'QF_LRAFP', 'QF_UFDTNIRA',
        'HORN', 'QF_BVRE', 'QF_FF', 'QF_UFFF', 'SAT', 'QF_SAT', 'SMTFD', 'QF_AUFBVLIA', 'QF_ABVLIA',
    ].map(name => ({ name, doc: logicDoc(name) })),
];

function logicDoc(name: string): string {
    if (name === 'HORN') return 'Z3: constrained Horn clauses (fixedpoint engine).';
    if (name === 'QF_FD') return 'Z3: quantifier-free finite domains.';
    const parts: string[] = [];
    let rest = name;
    if (rest.startsWith('QF_')) {
        parts.push('quantifier-free');
        rest = rest.slice(3);
    }
    const theories: Array<[string, string]> = [
        ['AX', 'arrays with extensionality'], ['A', 'arrays'], ['UF', 'uninterpreted functions'], ['BV', 'bit-vectors'],
        ['FP', 'floating point'], ['DT', 'datatypes'], ['IDL', 'integer difference logic'], ['RDL', 'real difference logic'],
        ['LIRA', 'linear integer/real arithmetic'], ['NIRA', 'non-linear integer/real arithmetic'],
        ['LIA', 'linear integer arithmetic'], ['LRA', 'linear real arithmetic'], ['NIA', 'non-linear integer arithmetic'],
        ['NRA', 'non-linear real arithmetic'], ['SLIA', 'strings with linear integer arithmetic'],
        ['SNIA', 'strings with non-linear integer arithmetic'], ['S', 'strings'], ['SEQ', 'sequences'], ['FF', 'finite fields'],
        ['RE', 'regular expressions'],
    ];
    while (rest.length > 0) {
        const match = theories.find(([prefix]) => rest.startsWith(prefix));
        if (!match) return `Logic ${name}.`;
        parts.push(match[1]);
        rest = rest.slice(match[0].length);
    }
    return `Logic ${name}: ${parts.join(', ')}.`;
}

export function isKnownLogic(name: string): boolean {
    return logics.some(l => l.name === name);
}
