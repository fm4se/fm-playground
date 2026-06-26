import { atom } from 'jotai';

export interface AlloyRedundantConstraint {
    constraintIndex: number;
    expression: string;
    sourceText: string;
    position: {
        startLine: number;
        startCol: number;
        endLine: number;
        endCol: number;
    };
}

export interface AlloyRedundancyResponse {
    status: number;
    totalConstraints?: number;
    redundantCount?: number;
    cmdId?: number;
    redundantConstraints?: AlloyRedundantConstraint[];
    error?: string;
    isDefault?: boolean;
}

export interface AlloyExplainResponse {
    status: number;
    redundant?: boolean;
    entailingCount?: number;
    message?: string;
    selectedConstraint?: {
        position: {
            startLine: number;
            startCol: number;
            endLine: number;
            endCol: number;
        };
        expression: string;
        sourceText: string;
    };
    entailingSet?: Array<{
        position: {
            startLine: number;
            startCol: number;
            endLine: number;
            endCol: number;
        };
        expression: string;
        sourceText: string;
    }>;
    error?: string;
}

export const alloyRedundancyResultsAtom = atom<AlloyRedundancyResponse | null>(null);
export const alloyExplainResultsAtom = atom<AlloyExplainResponse | null>(null);
