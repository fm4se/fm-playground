/** Regions that can be explained: models of one formula rejected by the other. */
export type LimbooleDiffMode = 'not-current-but-previous' | 'not-previous-but-current';

export const EXPLAINABLE_MODES: readonly string[] = ['not-current-but-previous', 'not-previous-but-current'];

export type LimbooleAssignment = Record<string, boolean>;

export interface LimbooleValue {
    name: string;
    value: 0 | 1;
}

export interface LimbooleLiteral {
    name: string;
    value: boolean;
    text: string;
}

/** A conjunction of witness literals E with base ∧ E ⊨ ¬compare. */
export interface LimbooleTerm {
    text: string;
    literals: LimbooleLiteral[];
    minimal: boolean;
}

export interface LimbooleChange {
    symbol: string;
    before: 0 | 1;
    after: 0 | 1;
}

/** Response of POST /diff-limboole/explain. */
export interface LimbooleExplanation {
    mode: LimbooleDiffMode;
    base: 'previous' | 'current';
    compare: 'previous' | 'current';
    witness: LimbooleValue[];
    private_variables: { previous: string[]; current: string[] };
    violated_conjuncts: string[];
    abduction: {
        explanation: LimbooleTerm;
        generalizations: LimbooleTerm[];
        coverage: 'complete' | 'limit-reached' | 'incomplete';
        uncovered_witness: LimbooleValue[] | null;
        minimal: boolean;
    };
    counterfactual: {
        status: 'found' | 'none';
        target: 'both' | 'compare' | null;
        model: LimbooleValue[] | null;
        changes: LimbooleChange[];
        alternatives: LimbooleChange[][];
        optimized: boolean;
    };
}

/** The explanation of one witness (by its index in the Output tab), or why it failed. */
export interface LimbooleExplanationEntry {
    witnessIndex: number;
    explanation?: LimbooleExplanation;
    error?: string;
}
