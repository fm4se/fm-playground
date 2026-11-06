import type { LangiumDocument, MaybePromise } from 'langium';
import type { SignatureHelpProvider } from 'langium/lsp';
import type { SignatureHelp, SignatureHelpOptions, SignatureHelpParams, SignatureInformation } from 'vscode-languageserver';
import { findCommandSpec } from '../builtins/commands.js';
import type { SmtServices } from '../smt-module.js';
import type { SmtScopeProvider } from '../scoping/smt-scope-provider.js';
import { parseRank, printSymbol, sortToString } from '../typing/sorts.js';
import { SymbolDescriber } from './describe.js';

/**
 * Shows the signatures of the function (or command) whose application encloses the
 * cursor and highlights the argument being written.
 */
export class SmtSignatureHelpProvider implements SignatureHelpProvider {

    protected readonly describer: SymbolDescriber;

    constructor(protected readonly services: SmtServices) {
        this.describer = new SymbolDescriber(services);
    }

    get signatureHelpOptions(): SignatureHelpOptions {
        return { triggerCharacters: ['(', ' '], retriggerCharacters: [' ', ')'] };
    }

    provideSignatureHelp(document: LangiumDocument, params: SignatureHelpParams): MaybePromise<SignatureHelp | undefined> {
        const text = document.textDocument.getText();
        const offset = document.textDocument.offsetAt(params.position);
        const call = findEnclosingCall(text, offset);
        if (!call) return undefined;
        const signatures = call.depth === 1 && !call.indexed ? this.commandSignatures(call.head) : undefined;
        const result = signatures ?? this.functionSignatures(document, call.head, call.indexed, call.start);
        if (!result || result.length === 0) return undefined;
        const active = result.findIndex(s => (s.parameters?.length ?? 0) > call.argIndex || s.label.includes('*') || s.label.includes('+)'));
        return {
            signatures: result,
            activeSignature: Math.max(0, active),
            activeParameter: call.argIndex
        };
    }

    protected commandSignatures(name: string): SignatureInformation[] | undefined {
        const command = findCommandSpec(name);
        if (!command) return undefined;
        return [{ label: command.syntax, documentation: { kind: 'markdown', value: command.doc } }];
    }

    protected functionSignatures(document: LangiumDocument, name: string, indexed: boolean, offset: number): SignatureInformation[] | undefined {
        const builtins = this.services.builtins.BuiltinLibrary;
        const scopeProvider = this.services.references.ScopeProvider as SmtScopeProvider;
        const description = scopeProvider.resolveGlobal(document, name, 'function', offset);
        const node = description?.node;
        if (!node) return undefined;
        if (builtins.isBuiltinNode(node)) {
            const specs = builtins.getFunctionSpecs(name, indexed);
            return specs.flatMap(spec => spec.ranks.map(rankText => {
                const rank = parseRank(rankText);
                const params = rank.params.map((p, i) => sortToString(p) + (i === rank.params.length - 1 && rank.repeat ? rank.repeat : ''));
                const head = spec.indices ? `(_ ${printSymbol(spec.name)} ${spec.indices.join(' ')})` : printSymbol(spec.name);
                return this.signature(head, params, sortToString(rank.result), spec.doc);
            }));
        }
        const checker = this.services.typing.SortChecker;
        const signature = checker.signatureOf(node as never);
        if (!signature) return undefined;
        const doc = this.describer.describe(node)?.documentation;
        return [this.signature(printSymbol(name), signature.params.map(sortToString), sortToString(signature.result), doc)];
    }

    private signature(head: string, params: string[], result: string, doc: string | undefined): SignatureInformation {
        let label = `(${head}`;
        const parameters: Array<{ label: [number, number] }> = [];
        for (const p of params) {
            label += ' ';
            parameters.push({ label: [label.length, label.length + p.length] });
            label += p;
        }
        label += `) : ${result}`;
        return { label, parameters, documentation: doc ? { kind: 'markdown', value: doc } : undefined };
    }
}

interface EnclosingCall {
    head: string;
    indexed: boolean;
    /** Offset of the opening parenthesis. */
    start: number;
    /** Zero-based index of the argument at the cursor. */
    argIndex: number;
    /** Parenthesis depth of the call (1 = command). */
    depth: number;
}

/** Finds the innermost unclosed application before `offset` (text based, tolerant of incomplete input). */
export function findEnclosingCall(text: string, offset: number): EnclosingCall | undefined {
    // Tokenize up to the cursor, tracking open parentheses.
    const stack: Array<{ start: number; items: string[]; inItem: boolean }> = [];
    let i = 0;
    let current: { start: number; items: string[]; inItem: boolean } | undefined;
    const startItem = (token: string) => {
        if (current) current.items.push(token);
    };
    while (i < offset) {
        const c = text[i];
        if (c === ';') { while (i < offset && text[i] !== '\n') i++; continue; }
        if (c === '#' && text[i + 1] === '|') { const e = text.indexOf('|#', i + 2); i = e < 0 ? offset : e + 2; continue; }
        if (c === '"') {
            let j = i + 1;
            while (j < text.length && !(text[j] === '"' && text[j + 1] !== '"')) j += text[j] === '"' ? 2 : 1;
            startItem(text.slice(i, j + 1));
            i = j + 1;
            continue;
        }
        if (c === '|') {
            const e = text.indexOf('|', i + 1);
            const end = e < 0 ? text.length : e + 1;
            startItem(text.slice(i + 1, end - 1));
            i = end;
            continue;
        }
        if (c === '(') {
            if (current) stack.push(current);
            current = { start: i, items: [], inItem: false };
            i++;
            continue;
        }
        if (c === ')') {
            const closed = current;
            current = stack.pop();
            if (closed && current) current.items.push(closed.items[0] === '_' ? `(_ ${closed.items[1] ?? ''})` : '(...)');
            i++;
            continue;
        }
        if (/\s/.test(c)) { i++; continue; }
        let j = i;
        while (j < offset && !/[\s()";|]/.test(text[j])) j++;
        startItem(text.slice(i, j));
        i = j;
    }
    if (!current || current.items.length === 0) return undefined;
    let head = current.items[0];
    let indexed = false;
    const indexedHead = head.match(/^\(_ (.+)\)$/);
    if (indexedHead) {
        head = indexedHead[1];
        indexed = true;
    }
    if (head === '(...)' || head === '_') return undefined;
    // If the cursor is right after a token (no whitespace), it is still part of that argument.
    const atTokenEnd = offset > 0 && !/[\s(]/.test(text[offset - 1]);
    const argIndex = Math.max(0, current.items.length - 1 - (atTokenEnd ? 1 : 0));
    return { head, indexed, start: current.start, argIndex, depth: stack.length + 1 };
}
