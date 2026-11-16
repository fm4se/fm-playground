import { saveCodeAndRefreshHistory } from '@/utils/codeExecutionUtils';
import { fmpConfig } from '@/ToolMaps';
import {
    editorValueAtom,
    jotaiStore,
    languageAtom,
    permalinkAtom,
    isExecutingAtom,
    outputAtom,
    smtDiffOptionsAtom,
    diffComparisonHistoryIdAtom,
    smtDiffWitnessAtom,
    smtDiffFilterAtom,
} from '@/atoms';
import { Permalink } from '@/types';
import axios from 'axios';
import {
    SmtDiffBanner,
    SmtDiffRun,
    SmtDirection,
    SmtErrorDetail,
    SmtExplanation,
    SmtWitnessStep,
} from './smtDiffTypes';

/** The witness enumerations of the analysis options, and the region each one shows. */
export const ANALYSIS_DIRECTION: Record<string, SmtDirection | null> = {
    'not-current-but-previous': 'tightening',
    'not-previous-but-current': 'relaxation',
    'common-witness': null,
};

const DIRECTION_ANALYSIS: Record<SmtDirection, string> = {
    tightening: 'not-current-but-previous',
    relaxation: 'not-previous-but-current',
};

/** A sentence describing the models of a region. */
export const REGION_TEXT: Record<SmtDirection, string> = {
    tightening: 'Models that satisfy the previous script but not the current script.',
    relaxation: 'Models that satisfy the current script but not the previous script.',
};

const RELATION_BANNERS: Record<string, SmtDiffBanner> = {
    equivalent: {
        kind: 'equivalent',
        summary: 'Current ≡ Previous',
        detail: 'All models that satisfy the current script also satisfy the previous script, and vice versa.',
    },
    tightened: {
        kind: 'implies',
        summary: 'Current ⊨ Previous',
        detail: 'All models that satisfy the current script also satisfy the previous script. Some models that satisfy the previous script do not satisfy the current script.',
    },
    relaxed: {
        kind: 'implies',
        summary: 'Previous ⊨ Current',
        detail: 'All models that satisfy the previous script also satisfy the current script. Some models that satisfy the current script do not satisfy the previous script.',
    },
    incomparable: {
        kind: 'incomparable',
        summary: 'The scripts are incomparable',
        detail: 'There exist models that satisfy the current script but not the previous script, and vice versa.',
    },
    unknown: {
        kind: 'unknown',
        summary: 'The relation is unknown',
        detail: 'The solver could not decide how the scripts relate (possibly a timeout).',
    },
};

/** Banners for a diff option whose region turned out to be empty. */
const EMPTY_REGION_BANNERS: Record<string, SmtDiffBanner> = {
    'common-witness': {
        kind: 'info',
        summary: 'No common witness',
        detail: 'No model satisfies both the previous and the current script.',
    },
    'not-previous-but-current': {
        kind: 'implies',
        summary: 'Current ⊨ Previous',
        detail: 'All models that satisfy the current script also satisfy the previous script. No model satisfies the current script but not the previous script.',
    },
    'not-current-but-previous': {
        kind: 'implies',
        summary: 'Previous ⊨ Current',
        detail: 'All models that satisfy the previous script also satisfy the current script. No model satisfies the previous script but not the current script.',
    },
};

const WITNESS_BANNERS: Record<string, SmtDiffBanner> = {
    'common-witness': { kind: 'info', summary: 'Models that satisfy both the previous and the current script.' },
    'not-previous-but-current': { kind: 'info', summary: REGION_TEXT.relaxation },
    'not-current-but-previous': { kind: 'info', summary: REGION_TEXT.tightening },
};

/** Turn an API error into a banner; structured errors name the offending script. */
export function errorBanner(err: any): SmtDiffBanner {
    const detail: SmtErrorDetail | string | undefined = err?.response?.data?.detail;
    if (detail && typeof detail === 'object') {
        if (detail.code === 'parse_error') {
            const where = detail.script ? `the ${detail.script} script` : 'the scripts';
            return { kind: 'error', summary: `Error in ${where}`, detail: detail.message };
        }
        if (detail.code === 'filter_error') {
            return { kind: 'error', summary: 'Error in the witness filter', detail: detail.message };
        }
        if (detail.code === 'timeout') {
            return { kind: 'unknown', summary: 'The analysis timed out', detail: detail.message };
        }
        return { kind: 'error', summary: 'The analysis failed', detail: detail.message };
    }
    if (typeof detail === 'string') {
        return { kind: 'error', summary: 'The analysis failed', detail };
    }
    return {
        kind: 'error',
        summary: 'The analysis failed',
        detail: `${err?.message ?? err}. If the problem persists, open an issue at ${fmpConfig.issues}`,
    };
}

/** Return a readable error message of a failed request. */
export function errorMessage(err: any): string {
    const banner = errorBanner(err);
    return banner.detail ? `${banner.summary}: ${banner.detail}` : banner.summary;
}

async function getSmtDiffWitness(permalink: Permalink, analysis: string, filter?: string): Promise<SmtWitnessStep> {
    const params: Record<string, string> = {
        check: permalink.check ?? '',
        p: permalink.permalink ?? '',
        analysis,
        format: 'json',
    };
    if (filter && filter.trim()) {
        params.filter = filter;
    }
    const response = await axios.get('/diff-smt/run/', { params });
    return response.data;
}

async function getSmtDiffRelation(permalink: Permalink): Promise<{ relation: string; message: string }> {
    const params = { check: permalink.check, p: permalink.permalink, analysis: 'semantic-relation', format: 'json' };
    const response = await axios.get('/diff-smt/run/', { params });
    return response.data;
}

export async function getNextSmtDiffWitness(specId: string, p: string): Promise<SmtWitnessStep> {
    const response = await axios.get(`/diff-smt/next/${specId}`, { params: { p, format: 'json' } });
    return response.data;
}

/** Explain the ``witnessIndex``-th witness (from 0) of a region, enumerated with the same filter. */
export async function explainSmtDiffWitness(
    permalink: Permalink,
    direction: SmtDirection,
    witnessIndex: number,
    filter: string
): Promise<SmtExplanation> {
    const response = await axios.post('/diff-smt/explain', {
        check: permalink.check,
        p: permalink.permalink,
        mode: direction,
        witness: witnessIndex,
        filter,
    });
    return response.data;
}

/** Run one diff option and describe its outcome. */
async function runWitnessAnalysis(permalink: Permalink, analysis: string, filter: string): Promise<SmtDiffRun> {
    const direction = ANALYSIS_DIRECTION[analysis];
    const base = { analysis, direction, explainable: direction ? [direction] : [], filter, permalink };
    const step = await getSmtDiffWitness(permalink, analysis, filter);
    if (step.status === 'sat') {
        return { ...base, banner: WITNESS_BANNERS[analysis], firstWitness: step };
    }
    if (step.status === 'unknown') {
        const reason = step.reason_unknown ? ` (${step.reason_unknown})` : '';
        const banner: SmtDiffBanner = {
            kind: 'unknown',
            summary: 'The solver could not decide',
            detail: `The solver returned unknown${reason}, possibly because of a timeout.`,
        };
        return { ...base, direction: null, explainable: [], banner, firstWitness: null };
    }
    return { ...base, direction: null, explainable: [], banner: EMPTY_REGION_BANNERS[analysis], firstWitness: null };
}

/** Compute the relation and, like alloy-diff, the first witness of a region that differs. */
async function runSemanticRelation(permalink: Permalink): Promise<SmtDiffRun> {
    const { relation } = await getSmtDiffRelation(permalink);
    const banner = RELATION_BANNERS[relation] ?? RELATION_BANNERS.unknown;
    const diverging: SmtDirection[] =
        relation === 'tightened'
            ? ['tightening']
            : relation === 'relaxed'
              ? ['relaxation']
              : relation === 'incomparable'
                ? ['relaxation', 'tightening']
                : [];
    const base = { analysis: 'semantic-relation', banner, filter: '', permalink };
    if (diverging.length === 0) {
        return { ...base, direction: null, explainable: [], firstWitness: null };
    }
    const direction = diverging[0];
    const step = await getSmtDiffWitness(permalink, DIRECTION_ANALYSIS[direction]);
    const shown = { ...banner, detail: `${banner.detail} Witnesses shown: ${REGION_TEXT[direction].toLowerCase()}` };
    if (step.status !== 'sat') {
        return { ...base, direction: null, explainable: [], firstWitness: null };
    }
    return { ...base, banner: shown, direction, explainable: diverging, firstWitness: step };
}

export const executeSmtDiffTool = async () => {
    const editorValue = jotaiStore.get(editorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const smtDiffOption = jotaiStore.get(smtDiffOptionsAtom);
    const diffComparisonHistoryId = jotaiStore.get(diffComparisonHistoryIdAtom);
    const filterExpression = jotaiStore.get(smtDiffFilterAtom);

    // Create metadata with leftSideCodeId
    const metadata = {
        leftSideCodeId: diffComparisonHistoryId,
        diff_option: smtDiffOption,
    };

    // Save the code with SemDiff check type
    const response = await saveCodeAndRefreshHistory(
        editorValue,
        language.short + 'SemDiff',
        permalink.permalink || null,
        metadata
    );

    if (response) {
        jotaiStore.set(permalinkAtom, response.data);
    } else {
        jotaiStore.set(
            outputAtom,
            `Unable to generate permalink. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(isExecutingAtom, false);
        return;
    }

    jotaiStore.set(smtDiffWitnessAtom, await runSmtDiffAnalysis(response.data, smtDiffOption, filterExpression));
    jotaiStore.set(isExecutingAtom, false);
};

/** Analyze the scripts of a saved permalink; failures are reported in the run's banner. */
export async function runSmtDiffAnalysis(permalink: Permalink, analysis: string, filter: string): Promise<SmtDiffRun> {
    try {
        return analysis === 'semantic-relation'
            ? await runSemanticRelation(permalink)
            : await runWitnessAnalysis(permalink, analysis, filter);
    } catch (err: any) {
        return {
            analysis,
            banner: errorBanner(err),
            direction: null,
            explainable: [],
            firstWitness: null,
            filter,
            permalink,
        };
    }
}
