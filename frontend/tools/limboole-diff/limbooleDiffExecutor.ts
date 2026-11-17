import { saveCodeAndRefreshHistory } from '@/utils/codeExecutionUtils';
import { fmpConfig } from '@/ToolMaps';
import {
    editorValueAtom,
    jotaiStore,
    languageAtom,
    permalinkAtom,
    isExecutingAtom,
    outputAtom,
    limbooleDiffOptionsAtom,
    diffComparisonHistoryIdAtom,
    limbooleDiffWitnessAtom,
    limbooleDiffFilterAtom,
} from '@/atoms';
import { Permalink } from '@/types';
import axios from 'axios';
import { LimbooleAssignment, LimbooleDiffMode, LimbooleExplanation } from './limbooleDiffTypes';

async function getLimbooleDiffWitness(permalink: Permalink, analysis: string, filter?: string) {
    let url = `/diff-limboole/run/?check=${permalink.check}&p=${permalink.permalink}&analysis=${analysis}`;
    if (filter && filter.trim()) {
        url += `&filter=${encodeURIComponent(filter)}`;
    }
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        throw error;
    }
}

export async function getNextLimbooleDiffWitness(specId: string, p: string) {
    let url = `/diff-limboole/next/${specId}?p=${p}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        throw error;
    }
}

/** Explain a witness (its assignment) of a difference region: abductive and counterfactual explanations. */
export async function explainLimbooleDiffWitness(
    permalink: Permalink,
    analysis: LimbooleDiffMode,
    assignment: LimbooleAssignment
): Promise<LimbooleExplanation> {
    const response = await axios.post('/diff-limboole/explain', {
        check: permalink.check,
        p: permalink.permalink,
        analysis,
        assignment,
    });
    return response.data;
}

/** A readable message for a failed request; structured errors name the offending formula. */
export function limbooleErrorMessage(err: any): string {
    const detail = err?.response?.data?.detail;
    if (detail && typeof detail === 'object') {
        return detail.script ? `Error in the ${detail.script} formula: ${detail.message}` : detail.message;
    }
    if (typeof detail === 'string') return detail;
    return err?.message ?? 'Unknown error';
}

export const executeLimbooleDiffTool = async () => {
    const editorValue = jotaiStore.get(editorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const limbooleDiffOption = jotaiStore.get(limbooleDiffOptionsAtom);
    const diffComparisonHistoryId = jotaiStore.get(diffComparisonHistoryIdAtom);
    const filterExpression = jotaiStore.get(limbooleDiffFilterAtom);

    // Create metadata with leftSideCodeId
    const metadata = {
        leftSideCodeId: diffComparisonHistoryId,
        diff_option: limbooleDiffOption,
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

    try {
        // Call the backend to get the first witness with the filter parameter
        const res = await getLimbooleDiffWitness(response.data, limbooleDiffOption, filterExpression);
        // Remember the analysis of this run: Explain needs it even if the option changes later.
        jotaiStore.set(limbooleDiffWitnessAtom, { ...res, analysis: limbooleDiffOption });
    } catch (err: any) {
        if (err.response?.status === 404) {
            jotaiStore.set(limbooleDiffWitnessAtom, {
                error: 'No witnesses found',
            });
        } else {
            jotaiStore.set(limbooleDiffWitnessAtom, {
                error: `${err.message}. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`,
            });
        }
    }
    jotaiStore.set(isExecutingAtom, false);
};
