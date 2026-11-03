import axios from 'axios';
import { getAlloyEngine } from '../../engine';
import { AlloyRedundancyResponse, AlloyExplainResponse } from './redundancyAtoms';

function toError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
        return new Error(error.response?.data?.error || error.message);
    }
    return error instanceof Error ? error : new Error(String(error));
}

/**
 * Finds the maximal redundant set of constraints (in the browser or on the server, depending on
 * the configured execution mode).
 * @param code - The Alloy model source code
 * @param cmdId - The command index (-1 for global check across all commands)
 * @returns Promise containing the response with redundant constraints
 */
export async function checkAlloyRedundancyApi(code: string, cmdId: number = -1): Promise<AlloyRedundancyResponse> {
    try {
        return (await getAlloyEngine().maxRedundantSet(code, cmdId)) as AlloyRedundancyResponse;
    } catch (error) {
        throw toError(error);
    }
}

/**
 * Explains redundancy at a specific cursor offset.
 * @param code - The Alloy model source code
 * @param cursorPos - 1-based character offset where the cursor is located
 * @returns Promise containing the explain response with entailing constraint ranges
 */
export async function explainAlloyRedundancyApi(code: string, cursorPos: number): Promise<AlloyExplainResponse> {
    try {
        return (await getAlloyEngine().explainRedundancy(code, cursorPos)) as AlloyExplainResponse;
    } catch (error) {
        throw toError(error);
    }
}
