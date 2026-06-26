import axios from 'axios';
import { AlloyRedundancyResponse, AlloyExplainResponse } from './redundancyAtoms';

/**
 * Call the backend API to check for maximal redundant set of constraints in Alloy.
 * @param code - The Alloy model source code
 * @param cmdId - The command index (-1 for global check across all commands)
 * @returns Promise containing the API response with redundant constraints
 */
export async function checkAlloyRedundancyApi(code: string, cmdId: number = -1): Promise<AlloyRedundancyResponse> {
    try {
        const url = '/alloy/alloy/redundancy/maxRedundantSet';
        const response = await axios.post(url, { code, cmdId });
        return response.data;
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data?.error || error.message);
        }
        throw error;
    }
}

/**
 * Call the backend API to explain redundancy at a specific cursor offset.
 * @param code - The Alloy model source code
 * @param cursorPos - 1-based character offset where the cursor is located
 * @returns Promise containing the explain response with entailing constraint ranges
 */
export async function explainAlloyRedundancyApi(code: string, cursorPos: number): Promise<AlloyExplainResponse> {
    try {
        const url = '/alloy/alloy/redundancy/explain';
        const response = await axios.post(url, { code, cursorPos });
        return response.data;
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data?.error || error.message);
        }
        throw error;
    }
}


// TODO: Do we need check endpoint?