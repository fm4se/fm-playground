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
    alloyDiffCmd1Atom,
    alloyDiffCmd2Atom,
} from '@/atoms';
import { Permalink } from '@/types';
import axios from 'axios';

async function getAlloyDiffWitness(permalink: Permalink, analysis: string, cmdIndex1: number, cmdIndex2: number) {
    let url = `/diff-alloy/alloy/diff/run/?check=${permalink.check}&p=${permalink.permalink}&analysis=${analysis}&cmdIndex1=${cmdIndex1}&cmdIndex2=${cmdIndex2}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        throw error;
    }
}

export async function getNextAlloyDiffWitness(specId: string, p: string) {
    let url = `/diff-alloy/alloy/diff/next/${specId}?p=${p}`;
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
    const cmd1 = jotaiStore.get(alloyDiffCmd1Atom);
    const cmd2 = jotaiStore.get(alloyDiffCmd2Atom);
    const diffComparisonHistoryId = jotaiStore.get(diffComparisonHistoryIdAtom);

    if (!diffComparisonHistoryId || diffComparisonHistoryId === -1) {
        jotaiStore.set(alloyDiffWitnessAtom, {
            error: 'Please select a comparison file from the history panel first.',
        });
        jotaiStore.set(isExecutingAtom, false);
        return;
    }

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
        if (alloyDiffOption === 'semantic-relation') {
            const resF1NotF2 = await getAlloyDiffWitness(response.data, 'not-previous-but-current', cmd1.value, cmd2.value).catch(e => ({ error: e.message || 'error' }));
            const resNotF1ButF2 = await getAlloyDiffWitness(response.data, 'not-current-but-previous', cmd1.value, cmd2.value).catch(e => ({ error: e.message || 'error' }));

            const isF1NotF2Unsat = !!resF1NotF2.error;
            const isNotF1ButF2Unsat = !!resNotF1ButF2.error;

            let semanticRelationMessage = '';
            let finalRes: any = {};

            if (isF1NotF2Unsat && isNotF1ButF2Unsat) {
                semanticRelationMessage = "<details><summary>Current ≡ Previous</summary>All instances that satisfy the current model also satisfy the previous model, and vice versa.</details>";
                finalRes = { error: semanticRelationMessage };
            } else if (!isF1NotF2Unsat && isNotF1ButF2Unsat) {
                semanticRelationMessage = "<details><summary>Previous ⊨ Current</summary>All instances that satisfy the previous model also satisfy the current model. Some instances that satisfy the current model do not satisfy the previous model.</details>";
                finalRes = { ...resF1NotF2, semanticRelationMessage };
            } else if (isF1NotF2Unsat && !isNotF1ButF2Unsat) {
                semanticRelationMessage = "<details><summary>Current ⊨ Previous</summary>All instances that satisfy the current model also satisfy the previous model. Some instances that satisfy the previous model do not satisfy the current model.</details>";
                finalRes = { ...resNotF1ButF2, semanticRelationMessage };
            } else {
                semanticRelationMessage = "<details><summary>The models are incomparable</summary>There exist instances that satisfy the current model but not the previous model, and vice versa.</details>";
                finalRes = { ...resF1NotF2, semanticRelationMessage };
            }

            jotaiStore.set(alloyDiffWitnessAtom, finalRes);
        } else {
            const res = await getAlloyDiffWitness(response.data, alloyDiffOption, cmd1.value, cmd2.value);
            jotaiStore.set(alloyDiffWitnessAtom, res);
        }
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
