import { explainRedundancy, parseLineRanges, parseRangesToMonaco } from '@/../tools/smt/explainRedundancy';
import { validateAssertion } from '@/../tools/smt/assertionValidator';
import { extractAssertion, findAssertionSpans } from '@/../tools/smt/assertionParser';
import { checkRedundancy } from '@/../tools/smt/checkRedundancy';
import { getLineToHighlight } from '@/../tools/common/lineHighlightingUtil';
import { saveCodeAndRefreshHistory } from '@/utils/codeExecutionUtils';
import { fmpConfig } from '@/ToolMaps';
import { initiateModelIteration } from '@/../tools/smt/smtIterateModels';
import {
    editorValueAtom,
    jotaiStore,
    languageAtom,
    permalinkAtom,
    isExecutingAtom,
    lineToHighlightAtom,
    greenHighlightAtom,
    cursorLineAtom,
    cursorColumnAtom,
    selectedTextAtom,
    selectionRangeAtom,
    targetAssertionRangeAtom,
    minimalSetRangesAtom,
    outputAtom,
    enableLspAtom,
    smtCliOptionsAtom,
    smtModelAtom,
} from '@/atoms';
import axios from 'axios';
import { Permalink } from '@/types';
import { logToDb, beaconToDb } from '@/api/playgroundApi';
import { smtLspTelemetry } from './langium/config/smtLspTelemetry';
import {
    smtRedundantAssertionsAtom,
    smtRedundancySummaryAtom,
    buildSmtRedundantAssertions,
    getAssertionTexts,
    setupSmtRedundancyCodeLens,
    triggerSmtCodeLensUpdate,
    clearSmtRedundancyLenses,
} from '@/../tools/smt/features';

let smtExitBeaconRegistered = false;

function ensureSmtLspExitBeacon() {
    if (smtExitBeaconRegistered || typeof window === 'undefined') return;
    smtExitBeaconRegistered = true;

    window.addEventListener('pagehide', () => {
        const enableLsp = jotaiStore.get(enableLspAtom);
        const language = jotaiStore.get(languageAtom);
        const permalink = jotaiStore.get(permalinkAtom);

        if (
            enableLsp &&
            language?.short === 'SMT' &&
            permalink?.permalink &&
            smtLspTelemetry.hasUnflushedActivity()
        ) {
            beaconToDb(permalink.permalink, {
                analysis: 'smt-lsp-exit-flush',
                lsp: smtLspTelemetry.flushEpisodeStats(),
            });
        }
    });
}

function buildSmtExecutionMetadata(enableLsp: boolean, command: string) {
    ensureSmtLspExitBeacon();
    const lspStats = enableLsp ? smtLspTelemetry.flushEpisodeStats() : null;
    if (!enableLsp) {
        smtLspTelemetry.resetEpisodeCounters();
    }
    return {
        ls: enableLsp,
        command,
        ...(lspStats ? { lsp: lspStats } : {}),
    };
}

// Show CodeLens actions (comment out / remove / explain) above the given assertions
function showRedundancyLenses(assertions: ReturnType<typeof buildSmtRedundantAssertions>) {
    jotaiStore.set(smtRedundantAssertionsAtom, assertions);
    setupSmtRedundancyCodeLens((window as any).monaco);
    triggerSmtCodeLensUpdate();
}

function setCheckSummary(editorValue: string, isDefault: boolean) {
    jotaiStore.set(smtRedundancySummaryAtom, {
        kind: 'check',
        totalAssertions: findAssertionSpans(editorValue).length,
        isDefault,
    });
}

async function fetchZ3Result(permalink: Permalink) {
    let url = `/smt/smt/run/?check=${permalink.check}&p=${permalink.permalink}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        throw error;
    }
}

/**
 * Execute Z3 on the server.
 * Handles redundant assertions if returned by the server.
 */
export const executeZ3WithOptionOnServer = async () => {
    const smtCliOption = jotaiStore.get(smtCliOptionsAtom);

    // Clear the smtModelAtom and redundancy lenses when starting a new execution
    jotaiStore.set(smtModelAtom, null);
    clearSmtRedundancyLenses();

    // Determine which function to execute based on the selected option
    if (smtCliOption?.value === 'explain-redundancy') {
        await executeExplainRedundancy();
    } else if (smtCliOption?.value === 'check-redundancy') {
        await executeCheckRedundancy();
    } else if (smtCliOption?.value === 'iterate-models') {
        await executeIterateModels();
    } else if (smtCliOption?.value === 'execute-z3') {
        await executeZ3();
    }
};

// Explain redundancy of the assertion at the cursor (used by the "Explain Redundancy" CodeLens)
export async function executeSmtExplainRedundancy() {
    jotaiStore.set(smtModelAtom, null);
    clearSmtRedundancyLenses();
    await executeExplainRedundancy();
}

// Execute Z3 to explain redundancy at the current cursor line.
async function executeExplainRedundancy() {
    const editorValue = jotaiStore.get(editorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const enableLsp = jotaiStore.get(enableLspAtom);
    const cursorLine = jotaiStore.get(cursorLineAtom);
    const cursorColumn = jotaiStore.get(cursorColumnAtom);
    const selectedText = jotaiStore.get(selectedTextAtom);
    const selectionRange = jotaiStore.get(selectionRangeAtom);

    let response: any = null;
    // Can be triggered from the CodeLens while another option is selected, so don't read smtCliOptionsAtom
    const metadata = buildSmtExecutionMetadata(enableLsp, 'explain-redundancy');

    try {
        response = await saveCodeAndRefreshHistory(editorValue, language.short, permalink.permalink || null, metadata);
        if (response) {
            jotaiStore.set(permalinkAtom, response.data);
        }
    } catch (error: any) {
        jotaiStore.set(
            outputAtom,
            `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(isExecutingAtom, false);
        return;
    }

    try {
        let result;
        let assertionText: string | null = null;

        // Try to extract the assertion from the editor
        // This handles both partial selection and multiple assertions on same line
        if (selectedText && selectedText.trim().length > 0) {
            // User has selected some text - extract the full assertion containing the selection
            assertionText = extractAssertion(
                editorValue,
                cursorLine,
                cursorColumn,
                selectionRange?.startLine,
                selectionRange?.startColumn,
                selectionRange?.endLine,
                selectionRange?.endColumn
            );
        } else {
            // No selection - extract assertion at cursor position
            assertionText = extractAssertion(editorValue, cursorLine, cursorColumn);
        }

        // If we found an assertion, validate and use it
        if (assertionText && assertionText.trim().length > 0) {
            // Validate the extracted assertion
            const validation = validateAssertion(assertionText);

            if (!validation.isValid) {
                // Show error message if validation fails
                jotaiStore.set(outputAtom, `; Error: ${validation.error}`);
                jotaiStore.set(greenHighlightAtom, []);
                jotaiStore.set(lineToHighlightAtom, []);
                jotaiStore.set(isExecutingAtom, false);
                return;
            }

            // Use the validated assertion text
            result = await explainRedundancy(
                response?.data.check,
                response?.data.permalink,
                undefined,
                validation.normalizedText
            );
        } else {
            // Fall back to using cursor line if no assertion found at cursor
            result = await explainRedundancy(response?.data.check, response?.data.permalink, cursorLine);
        }

        // Parse line ranges and set range-based highlighting
        const minimalRanges = parseRangesToMonaco(result.lineRanges);
        const targetRange = result.targetAssertionRange ? parseRangesToMonaco([result.targetAssertionRange])[0] : null;

        // Set the range atoms for precise highlighting
        jotaiStore.set(minimalSetRangesAtom, minimalRanges);
        jotaiStore.set(targetAssertionRangeAtom, targetRange);

        // Keep the old atoms for backward compatibility (can be removed later)
        const linesToHighlight = parseLineRanges(result.lineRanges);
        jotaiStore.set(greenHighlightAtom, linesToHighlight);
        jotaiStore.set(lineToHighlightAtom, [cursorLine]);

        // Format output message based on whether redundant assertions were found
        let outputMsg: string;
        if (result.lineRanges.length === 0) {
            outputMsg = `; No redundant assertion found.\n; Perhaps you selected a wrong or stronger assertion.`;
        } else {
            outputMsg = `; The green highlighted assertions make the yellow highlighted assertion redundant.`;
            const target = targetRange ?? {
                startLine: cursorLine,
                startColumn: 1,
                endLine: cursorLine,
                endColumn: Number.MAX_SAFE_INTEGER,
            };
            showRedundancyLenses([{ id: 0, ...target, explained: true }]);
        }
        const entailingTexts = getAssertionTexts(editorValue, minimalRanges);
        jotaiStore.set(smtRedundancySummaryAtom, {
            kind: 'explain',
            targetLine: targetRange?.startLine ?? cursorLine,
            entailing: minimalRanges.map((r, i) => ({
                startLine: r.startLine,
                endLine: r.endLine,
                sourceText: entailingTexts[i],
            })),
        });

        jotaiStore.set(outputAtom, outputMsg);
    } catch (error: any) {
        jotaiStore.set(
            outputAtom,
            `; ${error.message}\n; If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(greenHighlightAtom, []);
        jotaiStore.set(lineToHighlightAtom, []);
        jotaiStore.set(minimalSetRangesAtom, []);
        jotaiStore.set(targetAssertionRangeAtom, null);
    }

    jotaiStore.set(isExecutingAtom, false);
}

//Execute Z3 to check for redundancy
async function executeCheckRedundancy() {
    const editorValue = jotaiStore.get(editorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const enableLsp = jotaiStore.get(enableLspAtom);
    const smtCmdOption = jotaiStore.get(smtCliOptionsAtom);

    let response: any = null;
    const metadata = buildSmtExecutionMetadata(enableLsp, smtCmdOption.value);
    try {
        response = await saveCodeAndRefreshHistory(editorValue, language.short, permalink.permalink || null, metadata);
        if (response) {
            jotaiStore.set(permalinkAtom, response.data);
        }
    } catch (error: any) {
        jotaiStore.set(
            outputAtom,
            `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(isExecutingAtom, false);
        return;
    }

    try {
        const result = await checkRedundancy(response?.data.check, response?.data.permalink);

        // Check for errors in the output
        if (result.output.includes('(error')) {
            jotaiStore.set(outputAtom, result.output);
            jotaiStore.set(lineToHighlightAtom, getLineToHighlight(result.output, language.id) || []);
            jotaiStore.set(greenHighlightAtom, []);
            jotaiStore.set(isExecutingAtom, false);
            return;
        }

        // Check if redundant lines were found
        if (result.redundantLines && result.redundantLines.length > 0) {
            jotaiStore.set(lineToHighlightAtom, result.redundantLines);
            jotaiStore.set(greenHighlightAtom, []);
            showRedundancyLenses(buildSmtRedundantAssertions(editorValue, result.redundantLines));
            setCheckSummary(editorValue, false);

            jotaiStore.set(outputAtom, result.output);
            jotaiStore.set(isExecutingAtom, false);
            return;
        }

        // No redundant lines found
        setCheckSummary(editorValue, false);
        jotaiStore.set(outputAtom, result.output);
        jotaiStore.set(greenHighlightAtom, []);
        jotaiStore.set(lineToHighlightAtom, []);
    } catch (error: any) {
        jotaiStore.set(
            outputAtom,
            `; Error: ${error.message}\nIf the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(greenHighlightAtom, []);
        jotaiStore.set(isExecutingAtom, false);
        return;
    }
    jotaiStore.set(isExecutingAtom, false);
}

//Execute Z3 normally
async function executeZ3() {
    const editorValue = jotaiStore.get(editorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const enableLsp = jotaiStore.get(enableLspAtom);
    const smtCmdOption = jotaiStore.get(smtCliOptionsAtom);

    let response: any = null;
    const metadata = buildSmtExecutionMetadata(enableLsp, smtCmdOption.value);
    try {
        response = await saveCodeAndRefreshHistory(editorValue, language.short, permalink.permalink || null, metadata);
        if (response) {
            jotaiStore.set(permalinkAtom, response.data);
        }
    } catch (error: any) {
        jotaiStore.set(
            outputAtom,
            `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
    }

    try {
        const res = await fetchZ3Result(response?.data);

        // Handle new response format from backend
        // Backend returns: { result: string, redundant_lines: array }
        // Use nullish coalescing and provide safe defaults so empty strings/arrays are preserved
        const result: string = res.result ?? res[0] ?? '';
        const redundantLines: any[] = res.redundant_lines ?? res[1] ?? [];

        if (result.includes('(error')) {
            jotaiStore.set(outputAtom, result);
            jotaiStore.set(smtModelAtom, { result: result, error: true });
            jotaiStore.set(lineToHighlightAtom, getLineToHighlight(result, language.id) || []);
            jotaiStore.set(isExecutingAtom, false);
            return;
        }
        if (redundantLines && redundantLines.length > 0) {
            jotaiStore.set(lineToHighlightAtom, redundantLines);
            showRedundancyLenses(buildSmtRedundantAssertions(editorValue, redundantLines));
            setCheckSummary(editorValue, true);

            jotaiStore.set(outputAtom, result);
            jotaiStore.set(smtModelAtom, { result: result });
            jotaiStore.set(isExecutingAtom, false);
            return;
        }

        jotaiStore.set(outputAtom, result);
        jotaiStore.set(smtModelAtom, { result: result });
    } catch (error) {
        jotaiStore.set(
            outputAtom,
            (error as any).message +
                `\nIf the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(smtModelAtom, { error: (error as any).message });
        jotaiStore.set(isExecutingAtom, false);
        return;
    }
    jotaiStore.set(isExecutingAtom, false);
}

// Iterate through SMT models
async function executeIterateModels() {
    const editorValue = jotaiStore.get(editorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const enableLsp = jotaiStore.get(enableLspAtom);
    const smtCmdOption = jotaiStore.get(smtCliOptionsAtom);

    let response: any = null;
    const metadata = buildSmtExecutionMetadata(enableLsp, smtCmdOption.value);
    try {
        response = await saveCodeAndRefreshHistory(editorValue, language.short, permalink.permalink || null, metadata);
        if (response) {
            jotaiStore.set(permalinkAtom, response.data);
        }
    } catch (error: any) {
        jotaiStore.set(
            outputAtom,
            `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(isExecutingAtom, false);
        return;
    }

    try {
        // Use the initiateModelIteration function from smtIterateModels.ts
        const modelData = await initiateModelIteration(response?.data.check, response?.data.permalink);

        // Set the model with specId for next/previous navigation
        jotaiStore.set(smtModelAtom, {
            specId: modelData.specId,
            result: modelData.result,
            next_model: modelData.result,
        });
        jotaiStore.set(outputAtom, modelData.result);

        // Log the initial model iteration
        logToDb(response?.data.permalink || '', {
            analysis: 'SMT-ModelIteration-Init',
            specId: modelData.specId,
        });
    } catch (error: any) {
        jotaiStore.set(
            outputAtom,
            `; Error: ${error.message}\nIf the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(smtModelAtom, { error: error.message });
        jotaiStore.set(isExecutingAtom, false);
        return;
    }
    jotaiStore.set(isExecutingAtom, false);
}
