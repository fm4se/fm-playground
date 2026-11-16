import { Permalink } from '@/types';

/** Which script declares a symbol: only the previous one, only the current one, or both. */
export type SmtSide = 'previous' | 'current' | 'shared';

export interface SmtAssignment {
    name: string;
    arity: number;
    value: string;
    smtlib: string;
    side?: SmtSide;
}

export interface SmtModel {
    assignments: SmtAssignment[];
    text: string;
    smtlib: string;
}

export interface SmtErrorDetail {
    code: string;
    message: string;
    script: 'previous' | 'current' | null;
}

export interface SmtLogic {
    previous: string | null;
    current: string | null;
}

/** One step of a witness enumeration (/run and /next with format=json). */
export interface SmtWitnessStep {
    specId: string | null;
    status: 'sat' | 'unsat' | 'unknown' | 'exhausted' | 'incomplete' | 'error';
    reason_unknown: string;
    witness: SmtModel | null;
    logic: SmtLogic | null;
    error: SmtErrorDetail | null;
}

export interface SmtAssertion {
    text: string;
    kind: string;
    line: number | null;
    command_index: number | null;
    level: number;
}

export interface SmtLiteral {
    text: string;
    smtlib: string;
}

export interface SmtFormula {
    text: string;
    smtlib: string;
    literals: SmtLiteral[];
}

export interface SmtValueChange {
    symbol: string;
    before: string;
    after: string;
}

/** Response of POST /explain. */
export interface SmtExplanation {
    mode: SmtDirection;
    witness_index: number;
    base: 'previous' | 'current';
    compare: 'previous' | 'current';
    witness: SmtModel;
    violated_assertions: SmtAssertion[];
    undetermined_assertions: SmtAssertion[];
    abduction: {
        explanation: SmtFormula | null;
        generalizations: SmtFormula[];
        coverage: 'complete' | 'unknown' | 'limit-reached' | 'incomplete';
        uncovered_witness: SmtModel | null;
        minimal: boolean;
    };
    counterfactual: {
        status: string;
        target: 'both' | 'compare' | 'compare-unknown' | null;
        model: SmtModel | null;
        changes: SmtValueChange[];
        validated: boolean;
        optimized: boolean;
        note: string;
    };
}

/**
 * A difference region: ``tightening`` = models of the previous script rejected by the
 * current one, ``relaxation`` = models of the current script rejected by the previous one.
 */
export type SmtDirection = 'tightening' | 'relaxation';

export type SmtBannerKind = 'equivalent' | 'implies' | 'incomparable' | 'info' | 'unknown' | 'error';

export interface SmtDiffBanner {
    kind: SmtBannerKind;
    summary: string;
    detail?: string;
}

/** The result of one "Semantic Analysis" run, shown by SmtDiffOutput. */
export interface SmtDiffRun {
    analysis: string;
    banner: SmtDiffBanner;
    /** Region of the displayed witnesses; null for common witnesses or when there is none. */
    direction: SmtDirection | null;
    /** Regions that Explain explains: the displayed one and, for incomparable scripts, the other one. */
    explainable: SmtDirection[];
    firstWitness: SmtWitnessStep | null;
    filter: string;
    permalink: Permalink;
}

/** The state of the explanation of one region, as shown in the Explain tabs. */
export interface SmtExplanationEntry {
    direction: SmtDirection;
    witnessIndex: number;
    explanation?: SmtExplanation;
    error?: string;
}
