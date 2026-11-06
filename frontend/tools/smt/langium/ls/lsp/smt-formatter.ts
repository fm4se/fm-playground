import type { LangiumDocument, MaybePromise } from 'langium';
import type { Formatter } from 'langium/lsp';
import type {
    DocumentFormattingParams, DocumentOnTypeFormattingOptions, DocumentOnTypeFormattingParams, DocumentRangeFormattingParams,
    FormattingOptions, TextEdit
} from 'vscode-languageserver';

/**
 * S-expression formatter. It re-indents every line according to the parenthesis depth at
 * its start (Lisp style) and removes trailing whitespace. Line breaks are never changed,
 * so formatting cannot alter the meaning of a script. Lines that start inside a
 * multi-line string, quoted symbol or block comment are left untouched.
 */
export class SmtFormatter implements Formatter {

    formatDocument(document: LangiumDocument, params: DocumentFormattingParams): MaybePromise<TextEdit[]> {
        return this.format(document, params.options, 0, Infinity);
    }

    formatDocumentRange(document: LangiumDocument, params: DocumentRangeFormattingParams): MaybePromise<TextEdit[]> {
        return this.format(document, params.options, params.range.start.line, params.range.end.line);
    }

    formatDocumentOnType(document: LangiumDocument, params: DocumentOnTypeFormattingParams): MaybePromise<TextEdit[]> {
        return this.format(document, params.options, params.position.line, params.position.line);
    }

    get formatOnTypeOptions(): DocumentOnTypeFormattingOptions | undefined {
        return { firstTriggerCharacter: '\n' };
    }

    protected format(document: LangiumDocument, options: FormattingOptions, firstLine: number, lastLine: number): TextEdit[] {
        const unit = options.insertSpaces === false ? '\t' : ' '.repeat(options.tabSize > 0 ? Math.min(options.tabSize, 8) : 2);
        const lines = document.textDocument.getText().split(/\r?\n/);
        const edits: TextEdit[] = [];
        const state: ScanState = { depth: 0, mode: 'code' };
        lines.forEach((line, lineNumber) => {
            const startsInCode = state.mode === 'code';
            const leading = line.match(/^[ \t]*/)![0];
            const content = line.slice(leading.length);
            const closing = content.match(/^\)*/)![0].length;
            const depthAtStart = state.depth;
            scanLine(line, state);
            if (lineNumber < firstLine || lineNumber > lastLine) return;
            if (startsInCode) {
                // Trailing whitespace is kept if the line ends inside a string or quoted symbol.
                const body = state.mode === 'code' ? content.replace(/[ \t]+$/, '') : content;
                const indent = body.length === 0 ? '' : unit.repeat(Math.max(0, depthAtStart - closing));
                const newLine = indent + body;
                if (newLine !== line) {
                    edits.push({
                        range: { start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: line.length } },
                        newText: newLine
                    });
                }
            }
        });
        return edits;
    }
}

interface ScanState {
    depth: number;
    mode: 'code' | 'string' | 'quoted' | 'block-comment';
}

/** Advances the scanner state over one line (without its line break). */
function scanLine(line: string, state: ScanState): void {
    let i = 0;
    while (i < line.length) {
        const c = line[i];
        switch (state.mode) {
            case 'string':
                if (c === '"') {
                    if (line[i + 1] === '"') i++;
                    else state.mode = 'code';
                }
                i++;
                continue;
            case 'quoted':
                if (c === '|') state.mode = 'code';
                i++;
                continue;
            case 'block-comment':
                if (c === '|' && line[i + 1] === '#') {
                    state.mode = 'code';
                    i += 2;
                } else {
                    i++;
                }
                continue;
            case 'code':
                if (c === ';') return;
                if (c === '"') state.mode = 'string';
                else if (c === '|') state.mode = 'quoted';
                else if (c === '#' && line[i + 1] === '|') {
                    state.mode = 'block-comment';
                    i++;
                } else if (c === '(') state.depth++;
                else if (c === ')') state.depth = Math.max(0, state.depth - 1);
                i++;
        }
    }
}
