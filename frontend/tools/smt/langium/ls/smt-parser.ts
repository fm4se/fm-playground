/**
 * Parser wrapper that keeps the language server robust against very deeply nested input.
 *
 * Langium parsers are recursive-descent parsers: every nesting level of a term costs
 * dozens of stack frames, so machine-generated benchmarks (long `and`/`let` chains
 * nested hundreds of levels deep) would overflow the call stack. Before parsing, terms
 * nested deeper than {@link MAX_NESTING_DEPTH} are replaced by a placeholder symbol of
 * the same length (keeping all offsets and line numbers intact). The ranges are reported
 * as warnings by the validator. If the parser still overflows, an empty script with an
 * error is returned instead of crashing, and the (now corrupted) parser is rebuilt.
 */
import { createLangiumParser, type LangiumCoreServices, type LangiumParser, type ParseResult, type AstNode } from 'langium';
import { DEEP_TERM_PLACEHOLDER } from './builtins/library.js';

/** Maximum parenthesis nesting depth that is parsed; deeper terms are skipped. */
export const MAX_NESTING_DEPTH = 160;

export interface TruncatedRange {
    start: number;
    end: number;
}

/** Parse results of this language carry the ranges of skipped deeply nested terms. */
export type SmtParseResult<T = AstNode> = ParseResult<T> & { truncated?: TruncatedRange[] };

export function createSmtParser(services: LangiumCoreServices): LangiumParser {
    let inner = createLangiumParser(services);
    const parse = <T extends AstNode>(text: string, options?: Parameters<LangiumParser['parse']>[1]): SmtParseResult<T> => {
        const { text: safeText, truncated } = limitNesting(text, MAX_NESTING_DEPTH);
        try {
            const result: SmtParseResult<T> = inner.parse<T>(safeText, options);
            if (truncated.length > 0) result.truncated = truncated;
            return result;
        } catch (error) {
            if (!(error instanceof RangeError)) throw error;
            // The parser's internal state is corrupted after a stack overflow.
            inner = createLangiumParser(services);
            const result: SmtParseResult<T> = inner.parse<T>('', options);
            result.parserErrors.push(stackOverflowError(text));
            return result;
        }
    };
    return new Proxy(inner, {
        get(_target, property) {
            if (property === 'parse') return parse;
            const value = (inner as unknown as Record<string | symbol, unknown>)[property];
            return typeof value === 'function' ? value.bind(inner) : value;
        }
    });
}

function stackOverflowError(text: string): ParseResult['parserErrors'][number] {
    const lines = text.split('\n');
    const token = {
        image: '', startOffset: 0, endOffset: Math.max(0, text.length - 1),
        startLine: 1, startColumn: 1, endLine: lines.length, endColumn: lines[lines.length - 1].length,
        tokenTypeIdx: -1, tokenType: { name: 'EOF', PATTERN: /NOT_APPLICABLE/ }
    };
    return {
        name: 'StackOverflow',
        message: 'The script is nested too deeply to be analysed by the language server.',
        token,
        resyncedTokens: [],
        context: { ruleStack: [], ruleOccurrenceStack: [] }
    } as unknown as ParseResult['parserErrors'][number];
}

const BINDER_WORDS = new Set(['let', 'forall', 'exists', 'lambda', 'match', 'par', '_', 'as', '!']);

/**
 * Replaces parenthesized regions nested deeper than `maxDepth` by the placeholder
 * symbol. Strings, quoted symbols and comments are skipped. Returns the new text and the
 * replaced ranges. Linear time, no recursion.
 */
export function limitNesting(text: string, maxDepth: number): { text: string; truncated: TruncatedRange[] } {
    const opens: number[] = [];
    const truncated: TruncatedRange[] = [];
    let i = 0;
    const n = text.length;
    while (i < n) {
        const skipped = skipAtom(text, i);
        if (skipped !== undefined) {
            i = skipped;
            continue;
        }
        const c = text[i];
        if (c === '(') {
            if (opens.length >= maxDepth) {
                // Replace the innermost allowed region that contains this parenthesis.
                let level = opens.length - 1;
                while (level > 0 && !isTermPosition(text, opens[level])) level--;
                const start = opens[level];
                const end = findClosing(text, start);
                if (level > 0 && end - start >= DEEP_TERM_PLACEHOLDER.length) {
                    truncated.push({ start, end });
                    opens.length = level;
                    i = end;
                    continue;
                }
            }
            opens.push(i);
        } else if (c === ')') {
            opens.pop();
        }
        i++;
    }
    if (truncated.length === 0) return { text, truncated };
    let result = '';
    let last = 0;
    for (const { start, end } of truncated) {
        const blank = text.slice(start + DEEP_TERM_PLACEHOLDER.length, end).replace(/[^\r\n]/g, ' ');
        result += text.slice(last, start) + DEEP_TERM_PLACEHOLDER + blank;
        last = end;
    }
    return { text: result + text.slice(last), truncated };
}

/** Exclusive end offset of the region starting with '(' at `start`. */
function findClosing(text: string, start: number): number {
    let depth = 0;
    let i = start;
    while (i < text.length) {
        const skipped = skipAtom(text, i);
        if (skipped !== undefined) {
            i = skipped;
            continue;
        }
        if (text[i] === '(') depth++;
        else if (text[i] === ')' && --depth === 0) return i + 1;
        i++;
    }
    return text.length;
}

/** If a comment, string literal or quoted symbol starts at `i`, returns the offset after it. */
function skipAtom(text: string, i: number): number | undefined {
    const n = text.length;
    const c = text[i];
    if (c === ';') {
        const end = text.indexOf('\n', i);
        return end < 0 ? n : end;
    }
    if (c === '"') {
        let j = i + 1;
        while (j < n) {
            if (text[j] === '"') {
                if (text[j + 1] === '"') { j += 2; continue; }
                return j + 1;
            }
            j++;
        }
        return n;
    }
    if (c === '|') {
        const end = text.indexOf('|', i + 1);
        return end < 0 ? n : end + 1;
    }
    if (c === '#' && text[i + 1] === '|') {
        const end = text.indexOf('|#', i + 2);
        return end < 0 ? n : end + 2;
    }
    return undefined;
}

/**
 * Heuristic: a parenthesis starts a replaceable term unless it directly follows another
 * '(' (binding lists, application heads), a binder keyword, or an attribute keyword.
 */
function isTermPosition(text: string, offset: number): boolean {
    let j = offset - 1;
    while (j >= 0 && /\s/.test(text[j])) j--;
    if (j < 0) return false;
    if (text[j] === '(') return false;
    let k = j;
    while (k >= 0 && !/[\s()]/.test(text[k])) k--;
    const word = text.slice(k + 1, j + 1);
    if (BINDER_WORDS.has(word) || word.startsWith(':')) return false;
    return true;
}
