import { GrammarAST, type AstNodeDescription, type LangiumDocument, type MaybePromise, type ReferenceInfo, type Stream } from 'langium';
import {
    DefaultCompletionProvider, type CompletionAcceptor, type CompletionContext, type CompletionProviderOptions,
    type CompletionValueItem, type NextFeature
} from 'langium/lsp';
import { CompletionItemKind, CompletionList, InsertTextFormat, type CompletionItem, type CompletionParams } from 'vscode-languageserver';
import { commandSpecs, findCommandSpec } from '../builtins/commands.js';
import { allOptions, infoAttributes, infoFlags, logics, STATUS_VALUES } from '../builtins/options.js';
import type { SmtServices } from '../smt-module.js';
import type { SmtScopeProvider } from '../scoping/smt-scope-provider.js';
import { SymbolDescriber, type SymbolCategory } from './describe.js';
import { formatDescription } from './smt-hover-provider.js';

const TERM_ATTRIBUTES: Array<[string, string]> = [
    [':named', 'Names the term (in-line definition).'],
    [':pattern', 'Quantifier instantiation pattern: `:pattern (t+)`.'],
    [':no-pattern', 'Z3: term excluded from patterns.'],
    [':weight', 'Z3: quantifier weight.'],
    [':qid', 'Z3: quantifier identifier.'],
    [':skolemid', 'Z3: identifier for Skolem constants.'],
    [':lblpos', 'Z3: positive label.'],
    [':lblneg', 'Z3: negative label.'],
];

const COMMAND_ATTRIBUTES: Record<string, Array<[string, string]>> = {
    'assert-soft': [[':weight', 'Weight of the soft constraint (default 1).'], [':id', 'Objective group of the soft constraint.'], [':dweight', 'Decimal weight.']],
    'maximize': [[':id', 'Objective identifier.']],
    'minimize': [[':id', 'Objective identifier.']],
    'eval': [[':completion', 'Assign arbitrary values to symbols not in the model.'], [':model_index', 'Index of the model for box optimization.']],
};

/** Words treated as one completion token: SMT-LIB / Z3 symbols and keywords. */
const WORD = /[a-zA-Z0-9~!@$%^&*_\-+=<>.?/:,]*$/;

export class SmtCompletionProvider extends DefaultCompletionProvider {

    override readonly completionOptions: CompletionProviderOptions = { triggerCharacters: ['(', ':'] };

    protected readonly describer: SymbolDescriber;
    protected readonly smtScopeProvider: SmtScopeProvider;

    constructor(protected readonly services: SmtServices) {
        super(services);
        this.describer = new SymbolDescriber(services);
        this.smtScopeProvider = services.references.ScopeProvider as SmtScopeProvider;
    }

    override async getCompletion(document: LangiumDocument, params: CompletionParams): Promise<CompletionList | undefined> {
        const text = document.textDocument.getText();
        const offset = document.textDocument.offsetAt(params.position);
        const special = this.contextualCompletion(document, text, offset);
        if (special) return CompletionList.create(special, false);

        const list = await super.getCompletion(document, params);
        if (list && parenDepth(text, offset) === 0) {
            // Outside of any command: offer complete command templates.
            const word = text.slice(0, offset).match(WORD)?.[0] ?? '';
            const range = { start: document.textDocument.positionAt(offset - word.length), end: params.position };
            list.items = [
                ...commandSpecs.map((c, i): CompletionItem => ({
                    label: `(${c.name})`, kind: CompletionItemKind.Snippet, detail: c.syntax,
                    documentation: { kind: 'markdown', value: c.doc }, insertTextFormat: InsertTextFormat.Snippet,
                    textEdit: { range, newText: `(${c.snippet})` }, filterText: c.name, sortText: `0${String(i).padStart(3, '0')}`
                })),
            ];
        }
        return list;
    }

    /**
     * Completions that depend on the command being written rather than on grammar
     * features: option names and values, info flags, logics and term attributes.
     */
    protected contextualCompletion(document: LangiumDocument, text: string, offset: number): CompletionItem[] | undefined {
        const before = text.slice(Math.max(0, offset - 300), offset);
        const word = before.match(WORD)?.[0] ?? '';
        const range = { start: document.textDocument.positionAt(offset - word.length), end: document.textDocument.positionAt(offset) };
        const item = (label: string, kind: CompletionItemKind, doc?: string, detail?: string): CompletionItem => ({
            label, kind, detail, documentation: doc ? { kind: 'markdown', value: doc } : undefined, textEdit: { range, newText: label }
        });

        let m = before.match(/\(\s*(set-option|get-option)\s+(:[^\s()]*)?$/);
        if (m) {
            return allOptions().map(o => ({
                ...item(`:${o.name}`, CompletionItemKind.Property, o.doc, `${o.type}${o.defaultValue ? ` = ${o.defaultValue}` : ''}`),
                sortText: (o.standard ? '0' : '1') + o.name
            }));
        }
        m = before.match(/\(\s*set-option\s+(:[^\s()]+)\s+([^\s()]*)$/);
        if (m) {
            const option = allOptions().find(o => `:${o.name}`.toLowerCase().replace(/-/g, '_') === m![1].toLowerCase().replace(/-/g, '_'));
            if (option?.type === 'bool') return ['true', 'false'].map(v => item(v, CompletionItemKind.Value));
            return [];
        }
        m = before.match(/\(\s*get-info\s+(:[^\s()]*)?$/);
        if (m) return infoFlags.map(f => item(`:${f.name}`, CompletionItemKind.Property, f.doc));
        m = before.match(/\(\s*set-info\s+(:[^\s()]*)?$/);
        if (m) return infoAttributes.map(f => item(`:${f.name}`, CompletionItemKind.Property, f.doc));
        m = before.match(/\(\s*set-info\s+:status\s+([^\s()]*)$/);
        if (m) return STATUS_VALUES.map(v => item(v, CompletionItemKind.Value));
        m = before.match(/\(\s*set-logic\s+([^\s()]*)$/);
        if (m) return logics.map(l => item(l.name, CompletionItemKind.Module, l.doc));
        m = before.match(/\(\s*(assert-soft|maximize|minimize|eval)\b[^]*\s(:[^\s()]*)$/);
        if (m && parenDepth(text, offset) >= 1) {
            return (COMMAND_ATTRIBUTES[m[1]] ?? []).map(([k, d]) => item(k, CompletionItemKind.Property, d));
        }
        if (word.startsWith(':')) {
            return TERM_ATTRIBUTES.map(([k, d]) => item(k, CompletionItemKind.Property, d));
        }
        return undefined;
    }

    protected override completionFor(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): MaybePromise<void> {
        // Keywords are only proposed for commands and binders, never for terminals such as '(' or ')'.
        if (GrammarAST.isKeyword(next.feature) && !/^[a-z]/.test(next.feature.value)) return;
        return super.completionFor(context, next, acceptor);
    }

    protected override completionForKeyword(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): MaybePromise<void> {
        if (!this.filterKeyword(context, keyword)) return;
        const command = findCommandSpec(keyword.value);
        if (command) {
            acceptor(context, {
                label: keyword.value, kind: CompletionItemKind.Keyword, detail: command.syntax,
                documentation: { kind: 'markdown', value: command.doc },
                insertText: command.snippet, insertTextFormat: InsertTextFormat.Snippet, sortText: '5' + keyword.value
            });
            return;
        }
        acceptor(context, { label: keyword.value, kind: CompletionItemKind.Keyword, sortText: '5' + keyword.value });
    }

    protected override getReferenceCandidates(refInfo: ReferenceInfo, context: CompletionContext): Stream<AstNodeDescription> {
        return this.smtScopeProvider.getScopeAt(refInfo, context.offset).getAllElements();
    }

    protected override createReferenceCompletionItem(nodeDescription: AstNodeDescription, _refInfo: ReferenceInfo, _context: CompletionContext): CompletionValueItem {
        const node = nodeDescription.node;
        const description = node ? this.describer.describe(node) : undefined;
        const category = description?.category;
        const builtin = category === 'builtin-function' || category === 'builtin-sort';
        const z3Only = builtin && description?.documentation?.includes('*Z3 extension.*');
        return {
            nodeDescription,
            kind: categoryKind(category),
            detail: node ? this.describer.detail(node) : nodeDescription.type,
            documentation: description ? { kind: 'markdown', value: formatDescription(description) } : undefined,
            // Local variables first, then user declarations, then theory symbols.
            sortText: (category === 'variable' || category === 'parameter' ? '1' : builtin ? (z3Only ? '4' : '3') : '2') + nodeDescription.name
        };
    }
}

function categoryKind(category: SymbolCategory | undefined): CompletionItemKind {
    switch (category) {
        case 'builtin-function': return CompletionItemKind.Function;
        case 'function': return CompletionItemKind.Function;
        case 'relation': return CompletionItemKind.Function;
        case 'constant': return CompletionItemKind.Constant;
        case 'constructor': return CompletionItemKind.EnumMember;
        case 'selector': return CompletionItemKind.Field;
        case 'variable': return CompletionItemKind.Variable;
        case 'parameter': return CompletionItemKind.Variable;
        case 'named': return CompletionItemKind.Reference;
        case 'builtin-sort': return CompletionItemKind.Class;
        case 'sort': return CompletionItemKind.Class;
        case 'datatype': return CompletionItemKind.Enum;
        case 'sort-parameter': return CompletionItemKind.TypeParameter;
        default: return CompletionItemKind.Text;
    }
}

/** Parenthesis depth at an offset, ignoring strings, quoted symbols and comments. */
export function parenDepth(text: string, offset: number): number {
    let depth = 0;
    let i = 0;
    while (i < offset) {
        const c = text[i];
        if (c === ';') {
            while (i < offset && text[i] !== '\n') i++;
            continue;
        }
        if (c === '"') {
            i++;
            while (i < offset && !(text[i] === '"' && text[i + 1] !== '"')) i += text[i] === '"' ? 2 : 1;
            i++;
            continue;
        }
        if (c === '|') {
            i++;
            while (i < offset && text[i] !== '|') i++;
            i++;
            continue;
        }
        if (c === '#' && text[i + 1] === '|') {
            const end = text.indexOf('|#', i + 2);
            i = end < 0 ? offset : end + 2;
            continue;
        }
        if (c === '(') depth++;
        else if (c === ')') depth = Math.max(0, depth - 1);
        i++;
    }
    return depth;
}
