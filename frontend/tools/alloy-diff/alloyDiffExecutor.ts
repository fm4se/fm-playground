import { saveCodeAndRefreshHistory } from '@/utils/codeExecutionUtils';
import { fmpConfig } from '@/ToolMaps';
import {
    editorValueAtom,
    jotaiStore,
    languageAtom,
    permalinkAtom,
    isExecutingAtom,
    outputAtom,
    alloyDiffOptionsAtom,
    diffComparisonHistoryIdAtom,
    alloyDiffWitnessAtom,
} from '@/atoms';
import { Permalink } from '@/types';
import axios from 'axios';

async function getAlloyDiffWitness(permalink: Permalink, analysis: string) {
    let url = `/alloy/alloy/diff/run/?check=${permalink.check}&p=${permalink.permalink}&analysis=${analysis}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        throw error;
    }
}

export async function getNextAlloyDiffWitness(specId: string, p: string) {
    let url = `/alloy/alloy/diff/next/${specId}?p=${p}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        throw error;
    }
}

export const executeAlloyDiffTool = async () => {
    const editorValue = jotaiStore.get(editorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const alloyDiffOption = jotaiStore.get(alloyDiffOptionsAtom);
    const diffComparisonHistoryId = jotaiStore.get(diffComparisonHistoryIdAtom);

    const metadata = {
        leftSideCodeId: diffComparisonHistoryId,
        diff_option: alloyDiffOption,
    };

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
        const res = await getAlloyDiffWitness(response.data, alloyDiffOption);
        jotaiStore.set(alloyDiffWitnessAtom, res);
    } catch (err: any) {
        if (err.response?.status === 404) {
            jotaiStore.set(alloyDiffWitnessAtom, {
                error: 'No witnesses found',
            });
        } else {
            jotaiStore.set(alloyDiffWitnessAtom, {
                error: `${err.message}. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`,
            });
        }
    }
    jotaiStore.set(isExecutingAtom, false);
};
