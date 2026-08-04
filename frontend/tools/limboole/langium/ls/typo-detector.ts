import { LimbooleServices } from "./limboole-module.js";

/** 
 * Test an expressions against all expressions in the document. 
 * @param exprStr Current expression to be tested
 * @returns Proposal of an expression name in the document, that could be the intended spelling. 
*/
export function checkTypo(exprStr: string, services: LimbooleServices): string | undefined {
    const expressionMap = services.utils.LimbooleExpressionCollector.getCollection();

    if (!expressionMap[exprStr] || expressionMap[exprStr].length >= 2 || exprStr.length < 3) return undefined;

    for (const key in expressionMap) {
        if (expressionMap[exprStr].length > expressionMap[key].length) continue;

        const distance = levenshteinDistance(exprStr, key, 2);
        if (distance < 2 && distance !== 0) {
            return key;
        }
    }

    return undefined;
}

function levenshteinDistance(str1: string, str2: string, threshold: number): number {
    let len1 = str1.length;
    let len2 = str2.length;

    if (Math.abs(len1 - len2) > threshold) return threshold + 1;

    if (len1 < len2) {
        [str1, str2] = [str2, str1];
        [len1, len2] = [len2, len1];
    }

    let currentRow = new Array(len2 + 1).fill(0);
    for (let j = 0; j <= len2; j++) {
        currentRow[j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        let previousValue = currentRow[0];
        currentRow[0] = i;
        let minValue = i;

        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            const newValue = Math.min(
                currentRow[j - 1] + 1,        // Insertion
                previousValue + cost,         // Substitution
                currentRow[j] + 1             // Deletion
            );
            previousValue = currentRow[j];
            currentRow[j] = newValue;
            minValue = Math.min(minValue, newValue);
        }

        if (minValue > threshold) return threshold + 1;
    }

    return currentRow[len2];
}


