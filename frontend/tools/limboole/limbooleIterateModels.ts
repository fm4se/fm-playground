import run_limboole from '@/../tools/limboole/limboole';

// Check modes of the limboole wrappers (see window.Wrappers in limboole.js)
const VALIDITY = '0';
const SATISFIABILITY = '1';

export interface LimbooleResult {
    formula: string; // formula as it was in the editor when it was executed
    checkMode: string; // value of limbooleCliOptionsAtom
    output: string; // limboole output of the first run
}

export function supportsModelIteration(checkMode: string) {
    // QBF mode only reports the outermost existential variables, so blocking them is not meaningful
    return checkMode === VALIDITY || checkMode === SATISFIABILITY;
}

/**
 * Converts the assignment printed by limboole (`a = 1`, `b = 0`, ...) into a conjunction, e.g. `(a & !b)`.
 * Returns null if the output contains no assignment.
 */
function assignmentToFormula(output: string): string | null {
    const literals = output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('%') && line.includes('='))
        .map((line) => {
            const [variable, value] = line.split('=').map((part) => part.trim());
            return value === '1' ? variable : `!${variable}`;
        });
    return literals.length > 0 ? `(${literals.join(' & ')})` : null;
}

export function hasAssignment(output: string) {
    return /^% (SATISFIABLE|INVALID) formula/.test(output) && assignmentToFormula(output) !== null;
}

/**
 * Computes a satisfying assignment (satisfiability) or falsifying assignment (validity) of `formula`
 * that differs from all assignments in `previousOutputs`. Returns null if there is none left.
 *
 * Satisfiability: models of      (formula) & !(m1) & !(m2) ...
 * Validity:       counterexamples of (formula) | (m1) | (m2) ...
 */
export function getNextLimbooleModel(formula: string, checkMode: string, previousOutputs: string[]): string | null {
    const blockingClauses = previousOutputs
        .map(assignmentToFormula)
        .filter((assignment): assignment is string => assignment !== null)
        .map((assignment) => (checkMode === VALIDITY ? `| ${assignment}` : `& !${assignment}`));

    // Newlines keep trailing `%` comments of the formula from swallowing the blocking clauses
    const extendedFormula = [`(\n${formula}\n)`, ...blockingClauses].join('\n');
    const output = run_limboole(window.Wrappers[checkMode], extendedFormula);
    return hasAssignment(output) ? output : null;
}
