import { CstUtils, GrammarAST, GrammarUtils, isReference, type AstNode, type CstNode, type LangiumDocument, type MaybePromise } from 'langium';
import type { HoverProvider } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import {
    isAttribute, isBinaryConstant, isDecimalConstant, isGetInfo, isGetOption, isHexadecimalConstant, isNumeralConstant,
    isSetInfo, isSetLogic, isSetOption, isStringConstant, isTermCommand, isObjective, isTacticCommand, isDeclareRel
} from '../generated/ast.js';
import { findCommandSpec } from '../builtins/commands.js';
import { findOption, infoAttributes, infoFlags, logics } from '../builtins/options.js';
import type { SmtServices } from '../smt-module.js';
import { sortToString } from '../typing/sorts.js';
import { SymbolDescriber, type SymbolDescription } from './describe.js';

const KEYWORD_ATTRIBUTES: Record<string, string> = {
    ':named': 'Names a term (in-line definition). The name can be used in `check-sat-assuming`, `get-assignment` and unsat cores.',
    ':pattern': 'Instantiation pattern (trigger) of a quantifier.',
    ':no-pattern': 'Z3: a term that must not be used as an instantiation pattern.',
    ':weight': 'Z3: weight of a quantifier (instantiation priority) or of a soft assertion.',
    ':qid': 'Z3: identifier of a quantifier, shown in statistics.',
    ':skolemid': 'Z3: identifier used for Skolem constants of the quantifier.',
    ':lblpos': 'Z3: positive label of a term.',
    ':lblneg': 'Z3: negative label of a term.',
    ':id': 'Z3: identifier of an objective or a group of soft assertions.',
    ':subterm': 'Z3: name of the subterm predicate of a datatype.',
};

export class SmtHoverProvider implements HoverProvider {

    protected readonly describer: SymbolDescriber;

    constructor(protected readonly services: SmtServices) {
        this.describer = new SymbolDescriber(services);
    }

    getHoverContent(document: LangiumDocument, params: HoverParams): MaybePromise<Hover | undefined> {
        const root = document.parseResult.value.$cstNode;
        if (!root) return undefined;
        const offset = document.textDocument.offsetAt(params.position);
        const leaf = CstUtils.findDeclarationNodeAtOffset(root, offset, this.services.parser.GrammarConfig.nameRegexp)
            ?? CstUtils.findLeafNodeAtOffset(root, offset);
        if (!leaf) return undefined;
        const markdown = this.hoverForLeaf(leaf);
        return markdown ? { contents: { kind: 'markdown', value: markdown } } : undefined;
    }

    protected hoverForLeaf(leaf: CstNode): string | undefined {
        const node = leaf.astNode;
        const assignment = GrammarUtils.findAssignment(leaf);

        // References and declaration names
        if (assignment && (GrammarAST.isCrossReference(assignment.terminal) || assignment.feature === 'name')) {
            const target = this.services.references.References.findDeclarations(leaf)[0];
            if (!target) return undefined;
            const value = (assignment.$container ? (node as unknown as Record<string, unknown>)[assignment.feature] : undefined);
            return this.symbolHover(target, isReference(value) ? value.$refText : undefined);
        }
        // Keywords: commands, binders and term attributes
        if (GrammarAST.isKeyword(leaf.grammarSource)) {
            const keyword = leaf.grammarSource.value;
            const command = findCommandSpec(keyword);
            if (command) return this.commandHover(command.syntax, command.doc, command.z3Only);
            if (KEYWORD_ATTRIBUTES[keyword]) return `\`${keyword}\`\n\n${KEYWORD_ATTRIBUTES[keyword]}`;
            return this.binderHover(keyword);
        }
        // Option names, info flags, attribute keywords and logics
        const text = leaf.text;
        if (text.startsWith(':')) return this.keywordHover(node, text);
        if (isSetLogic(node)) {
            const logic = logics.find(l => l.name === text);
            return logic ? `**Logic** \`${logic.name}\`\n\n${logic.doc}` : undefined;
        }
        // Literals: show their sort
        if (isNumeralConstant(node) || isDecimalConstant(node) || isHexadecimalConstant(node) || isBinaryConstant(node) || isStringConstant(node)) {
            return '```smt2\n' + `${text} : ${sortToString(this.services.typing.SortChecker.sortOf(node))}` + '\n```';
        }
        return undefined;
    }

    protected symbolHover(target: AstNode, refText?: string): string | undefined {
        const description = this.describer.describe(target, refText);
        if (!description) return undefined;
        return formatDescription(description);
    }

    protected commandHover(syntax: string, doc: string, z3Only?: boolean): string {
        return '```smt2\n' + syntax + '\n```\n\n' + doc + (z3Only ? '\n\n*Z3 extension.*' : '');
    }

    protected binderHover(keyword: string): string | undefined {
        const docs: Record<string, [string, string]> = {
            'let': ['(let ((x t) ...) body)', 'Binds variables in parallel to the values of terms; they are visible in the body only.'],
            'forall': ['(forall ((x σ) ...) body)', 'Universal quantification over the sorted variables.'],
            'exists': ['(exists ((x σ) ...) body)', 'Existential quantification over the sorted variables.'],
            'lambda': ['(lambda ((x σ) ...) body)', 'Function abstraction (SMT-LIB 2.7). Z3 represents lambdas as arrays.'],
            'match': ['(match t ((pattern body) ...))', 'Case analysis over the constructors of a datatype value.'],
            'as': ['(as identifier σ)', 'Qualifies an identifier with its result sort, e.g. `(as nil (List Int))` or `(as const (Array Int Int))`.'],
            '!': ['(! t attribute+)', 'Annotates a term with attributes such as `:named` or `:pattern`.'],
            '_': ['(_ symbol index+)', 'Indexed identifier, e.g. `(_ extract 7 0)` or `(_ BitVec 32)`.'],
            'par': ['(par (T ...) (constructors))', 'Sort parameters of a parametric datatype.'],
        };
        const doc = docs[keyword];
        return doc ? '```smt2\n' + doc[0] + '\n```\n\n' + doc[1] : undefined;
    }

    protected keywordHover(node: AstNode, keyword: string): string | undefined {
        const container = isAttribute(node) ? node.$container : node;
        if (isSetOption(container) || isGetOption(container)) {
            const option = findOption(keyword);
            if (!option) return undefined;
            const def = option.defaultValue !== undefined && option.defaultValue !== '' ? ` (default: \`${option.defaultValue}\`)` : '';
            return `**Option** \`${keyword}\` : ${option.type}${def}\n\n${option.doc}${option.standard ? '' : '\n\n*Z3 parameter.*'}`;
        }
        if (isGetInfo(container)) {
            const flag = infoFlags.find(f => `:${f.name}` === keyword);
            return flag ? `**Info flag** \`${keyword}\`\n\n${flag.doc}` : undefined;
        }
        if (isSetInfo(container)) {
            const attr = infoAttributes.find(f => `:${f.name}` === keyword);
            return attr ? `**Info** \`${keyword}\`\n\n${attr.doc}` : undefined;
        }
        if (isTermCommand(container) || isObjective(container) || isTacticCommand(container) || isDeclareRel(container)) {
            const option = findOption(keyword);
            return KEYWORD_ATTRIBUTES[keyword] ? `\`${keyword}\`\n\n${KEYWORD_ATTRIBUTES[keyword]}` : option ? `\`${keyword}\`\n\n${option.doc}` : undefined;
        }
        return KEYWORD_ATTRIBUTES[keyword] ? `\`${keyword}\`\n\n${KEYWORD_ATTRIBUTES[keyword]}` : undefined;
    }
}

export function formatDescription(description: SymbolDescription): string {
    const code = [description.signature, ...description.overloads].join('\n');
    let result = '```smt2\n' + code + '\n```';
    if (description.theory) result += `\n\n*Theory:* ${description.theory}`;
    if (description.documentation) result += `\n\n${description.documentation}`;
    return result;
}
