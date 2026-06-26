import axios from 'axios';
import { saveCodeAndRefreshHistory } from '@/utils/codeExecutionUtils';
import { logToDb } from '@/api/playgroundApi';
import { fmpConfig } from '@/ToolMaps';
import {
    editorValueAtom,
    jotaiStore,
    languageAtom,
    permalinkAtom,
    isExecutingAtom,
    alloySelectedCmdAtom,
    alloyInstanceAtom,
    outputAtom,
    enableLspAtom,
    alloyCliOptionsAtom,
    lineToHighlightAtom,
    selectionRangeAtom,
    cursorLineAtom,
    cursorColumnAtom,
    minimalSetRangesAtom,
    targetAssertionRangeAtom,
    greenHighlightAtom,
} from '@/atoms';
import { Permalink } from '@/types';
import {
    checkAlloyRedundancyApi,
    explainAlloyRedundancyApi,
    alloyRedundancyResultsAtom,
    alloyExplainResultsAtom,
    setupAlloyRedundancyCodeLens,
    triggerAlloyCodeLensUpdate,
} from './features';

// Fixme: Checking redundancy by default. Disable later.
export const ENABLE_DEFAULT_REDUNDANCY_CHECK = true;

export function computeCharOffset(code: string, line: number, col: number): number {
    let currentLine = 1;
    let offset = 0;
    while (currentLine < line && offset < code.length) {
        if (code[offset] === '\n') {
            currentLine++;
        }
        offset++;
    }
    offset += Math.max(0, col - 1);
    return offset + 1; // 1-based character offset
}

async function getAlloyInstance(permalink: Permalink, cmd: number) {
    let url = `/alloy/alloy/instance?check=${permalink.check}&p=${permalink.permalink}&cmd=${cmd}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        throw error;
    }
}

async function performAlloyRedundancyCheck(editorValue: string, cmd: number, permalinkStr?: string, isDefault: boolean = false) {
    const res = await checkAlloyRedundancyApi(editorValue, cmd);
    jotaiStore.set(alloyRedundancyResultsAtom, { ...res, isDefault });

    if (permalinkStr) {
        logToDb(permalinkStr, {
            analysis: 'check-redundancy',
            isDefault,
            ...res,
        });
    }

    if (res.redundantConstraints && res.redundantConstraints.length > 0) {
        const lineSet = new Set<number>();
        res.redundantConstraints.forEach((c) => {
            if (c?.position?.startLine && c?.position?.endLine) {
                for (let l = c.position.startLine; l <= c.position.endLine; l++) {
                    lineSet.add(l);
                }
            }
        });
        jotaiStore.set(lineToHighlightAtom, Array.from(lineSet));
    } else {
        jotaiStore.set(lineToHighlightAtom, []);
    }

    setupAlloyRedundancyCodeLens((window as any).monaco);
    triggerAlloyCodeLensUpdate();
}

async function executeAlloyCheckRedundancy() {
    const editorValue = jotaiStore.get(editorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const alloySelectedCmd = jotaiStore.get(alloySelectedCmdAtom);
    const enableLsp = jotaiStore.get(enableLspAtom);
    const alloyCliOption = jotaiStore.get(alloyCliOptionsAtom);

    // Clear old explain decorations
    jotaiStore.set(alloyExplainResultsAtom, null);
    jotaiStore.set(greenHighlightAtom, []);
    jotaiStore.set(minimalSetRangesAtom, []);
    jotaiStore.set(targetAssertionRangeAtom, null);

    const cmdIndex = alloySelectedCmd < 0 ? 0 : alloySelectedCmd;
    const metadata = {
        ls: enableLsp,
        cmd: cmdIndex + 1,
        action: alloyCliOption?.value || 'check-redundancy',
    };
    const response = await saveCodeAndRefreshHistory(
        editorValue,
        language.short,
        permalink.permalink || null,
        metadata
    );
    if (response) {
        jotaiStore.set(permalinkAtom, response.data);
    } else {
        jotaiStore.set(
            outputAtom,
            `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(isExecutingAtom, false);
        return;
    }

    try {
        await performAlloyRedundancyCheck(editorValue, alloySelectedCmd, response?.data?.permalink, false);

        // Fetch standard instance output so the UI (viz, table, text, eval tabs) stays identical to execute Alloy!
        const cmdToFetch = alloySelectedCmd < 0 ? 0 : alloySelectedCmd;
        jotaiStore.set(alloyInstanceAtom, []);
        const instanceRes = await getAlloyInstance(response?.data, cmdToFetch);
        jotaiStore.set(alloyInstanceAtom, instanceRes);
    } catch (err: any) {
        if (err.response?.status === 429) {
            jotaiStore.set(alloyInstanceAtom, []);
            jotaiStore.set(outputAtom, 'Slow down! You are making too many requests. Please try again later.');
        } else {
            jotaiStore.set(alloyInstanceAtom, []);
            jotaiStore.set(
                outputAtom,
                `${err.message || 'Unknown error'}. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
            );
        }
    }
    jotaiStore.set(isExecutingAtom, false);
}

export async function executeAlloyExplainRedundancy() {
    const editorValue = jotaiStore.get(editorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const alloySelectedCmd = jotaiStore.get(alloySelectedCmdAtom);
    const enableLsp = jotaiStore.get(enableLspAtom);

    // Clear old check redundancy & explain decorations
    jotaiStore.set(alloyRedundancyResultsAtom, null);
    jotaiStore.set(lineToHighlightAtom, []);
    jotaiStore.set(alloyExplainResultsAtom, null);
    jotaiStore.set(greenHighlightAtom, []);
    jotaiStore.set(minimalSetRangesAtom, []);
    jotaiStore.set(targetAssertionRangeAtom, null);

    const cmdIndex = alloySelectedCmd < 0 ? 0 : alloySelectedCmd;
    const metadata = {
        ls: enableLsp,
        cmd: cmdIndex + 1,
        action: 'explain-redundancy',
    };
    const response = await saveCodeAndRefreshHistory(
        editorValue,
        language.short,
        permalink.permalink || null,
        metadata
    );
    if (response) {
        jotaiStore.set(permalinkAtom, response.data);
    } else {
        jotaiStore.set(
            outputAtom,
            `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(isExecutingAtom, false);
        return;
    }

    try {
        const selectionRange = jotaiStore.get(selectionRangeAtom);
        const cursorLine = jotaiStore.get(cursorLineAtom);
        const cursorColumn = jotaiStore.get(cursorColumnAtom);

        const line = selectionRange?.startLine || cursorLine || 1;
        const col = selectionRange?.startColumn || cursorColumn || 1;
        const cursorPos = computeCharOffset(editorValue, line, col);

        const res = await explainAlloyRedundancyApi(editorValue, cursorPos);
        jotaiStore.set(alloyExplainResultsAtom, res);

        if (response?.data?.permalink) {
            logToDb(response.data.permalink, {
                analysis: 'explain-redundancy',
                ...res,
            });
        }

        if (res && res.selectedConstraint?.position) {
            const pos = res.selectedConstraint.position;
            if (res.entailingSet && res.entailingSet.length > 0) {
                jotaiStore.set(targetAssertionRangeAtom, {
                    startLine: pos.startLine,
                    startColumn: pos.startCol || 1,
                    endLine: pos.endLine || pos.startLine,
                    endColumn: pos.endCol || Number.MAX_SAFE_INTEGER,
                });
                const greenRanges = res.entailingSet.map((item: any) => ({
                    startLine: item.position.startLine,
                    startColumn: item.position.startCol || 1,
                    endLine: item.position.endLine || item.position.startLine,
                    endColumn: item.position.endCol || Number.MAX_SAFE_INTEGER,
                }));
                jotaiStore.set(minimalSetRangesAtom, greenRanges);
            } else if (res.redundant) {
                // Structural redundancy (entailingSet is empty): highlight target constraint in green instead of yellow
                jotaiStore.set(targetAssertionRangeAtom, null);
                jotaiStore.set(minimalSetRangesAtom, [
                    {
                        startLine: pos.startLine,
                        startColumn: pos.startCol || 1,
                        endLine: pos.endLine || pos.startLine,
                        endColumn: pos.endCol || Number.MAX_SAFE_INTEGER,
                    },
                ]);
            }
        }

        setupAlloyRedundancyCodeLens((window as any).monaco);
        triggerAlloyCodeLensUpdate();

        // Fetch standard instance output so UI tabs (viz, table, text, eval) populate identically to execute Alloy!
        const cmdToFetch = alloySelectedCmd < 0 ? 0 : alloySelectedCmd;
        jotaiStore.set(alloyInstanceAtom, []);
        const instanceRes = await getAlloyInstance(response?.data, cmdToFetch);
        jotaiStore.set(alloyInstanceAtom, instanceRes);
    } catch (err: any) {
        if (err.response?.status === 429) {
            jotaiStore.set(alloyInstanceAtom, []);
            jotaiStore.set(outputAtom, 'Slow down! You are making too many requests. Please try again later.');
        } else {
            jotaiStore.set(alloyInstanceAtom, []);
            jotaiStore.set(alloyExplainResultsAtom, { status: 500, error: err.message || 'Unknown error' });
        }
    }
    jotaiStore.set(isExecutingAtom, false);
}

async function executeAlloyNormal() {
    const editorValue = jotaiStore.get(editorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const alloySelectedCmd = jotaiStore.get(alloySelectedCmdAtom);
    const enableLsp = jotaiStore.get(enableLspAtom);
    const alloyCliOption = jotaiStore.get(alloyCliOptionsAtom);

    jotaiStore.set(alloyRedundancyResultsAtom, null);
    jotaiStore.set(lineToHighlightAtom, []);
    jotaiStore.set(alloyExplainResultsAtom, null);
    jotaiStore.set(greenHighlightAtom, []);
    jotaiStore.set(minimalSetRangesAtom, []);
    jotaiStore.set(targetAssertionRangeAtom, null);
    triggerAlloyCodeLensUpdate();

    const cmdIndex = alloySelectedCmd < 0 ? 0 : alloySelectedCmd;
    const metadata = {
        ls: enableLsp,
        cmd: cmdIndex + 1,
        action: alloyCliOption?.value || 'execute-alloy',
    };
    const response = await saveCodeAndRefreshHistory(
        editorValue,
        language.short,
        permalink.permalink || null,
        metadata
    );
    if (response) {
        jotaiStore.set(permalinkAtom, response.data);
    } else {
        jotaiStore.set(
            outputAtom,
            `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(isExecutingAtom, false);
        return;
    }

    try {
        jotaiStore.set(alloyInstanceAtom, []);
        const res = await getAlloyInstance(response?.data, cmdIndex);
        jotaiStore.set(alloyInstanceAtom, res);

        if (ENABLE_DEFAULT_REDUNDANCY_CHECK) {
            try {
                await performAlloyRedundancyCheck(editorValue, alloySelectedCmd, response?.data?.permalink, true);
            } catch (bgErr) {
                console.error('Default background redundancy check failed:', bgErr);
            }
        }
    } catch (err: any) {
        if (err.response?.status === 429) {
            jotaiStore.set(alloyInstanceAtom, []);
            jotaiStore.set(outputAtom, 'Slow down! You are making too many requests. Please try again later.');
        } else {
            jotaiStore.set(alloyInstanceAtom, []);
            jotaiStore.set(
                outputAtom,
                `${err.message}. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
            );
        }
    }
    jotaiStore.set(isExecutingAtom, false);
}

export const executeAlloyTool = async () => {
    const alloyCliOption = jotaiStore.get(alloyCliOptionsAtom);
    if (alloyCliOption?.value === 'check-redundancy') {
        await executeAlloyCheckRedundancy();
    } else if (alloyCliOption?.value === 'explain-redundancy') {
        await executeAlloyExplainRedundancy();
    } else {
        await executeAlloyNormal();
    }
};
