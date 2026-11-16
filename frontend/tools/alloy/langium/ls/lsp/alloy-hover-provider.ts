import { CstUtils, GrammarAST, type AstNode, type LangiumDocument, type MaybePromise } from 'langium';
import { AstNodeHoverProvider } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import { isAtExpr, isQualName } from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';
import { isBuiltinReference, qualifiedText } from '../typing/sig-model.js';
import { AlloyDescriber, type Description } from './describe.js';

/** Documentation of builtin names (they resolve to the module root, not to a declaration). */
const BUILTINS: Record<string, string> = {
    'univ': '`univ` : {univ}\n\nThe set of all atoms.',
    'none': '`none` : {none}\n\nThe empty set.',
    'iden': '`iden` : {univ->univ}\n\nThe identity relation over all atoms.',
    'Int': '`Int` : {Int}\n\nThe set of integer atoms; its size is set by the bitwidth (`for 4 Int`).',
    'seq/Int': '`seq/Int` : {Int}\n\nThe sequence indices 0 .. maxseq-1.',
    'String': '`String` : {String}\n\nThe set of string atoms.',
    'steps': '`steps`\n\nThe trace steps of a temporal analysis; scoped with `for 1..10 steps`.',
    'disj': '`disj[e1, e2, ...]`\n\nTrue if the arguments are pairwise disjoint.',
    'int': '`int[e]` / `e.int`\n\nThe integer value of a set of Int atoms (their sum).',
    'sum': '`sum[e]` / `sum x: e | body`\n\nThe integer value of a set of Int atoms, or the sum of body over x.',
    'plus': '`plus[a, b]` : Int\n\nInteger addition (also `a fun/add b`).',
    'minus': '`minus[a, b]` : Int\n\nInteger subtraction (also `a fun/sub b`).',
    'mul': '`mul[a, b]` : Int\n\nInteger multiplication.',
    'div': '`div[a, b]` : Int\n\nInteger division.',
    'rem': '`rem[a, b]` : Int\n\nRemainder of integer division.',
    'add': '`add[a, b]` : Int\n\nInteger addition.',
    'sub': '`sub[a, b]` : Int\n\nInteger subtraction.',
};

/** Documentation of keywords. */
const KEYWORDS: Record<string, string> = {
    'sig': 'Declares a signature: a set of atoms, with fields relating them to other sets.',
    'abstract': 'An abstract signature has no atoms of its own: every atom belongs to one of its extensions.',
    'extends': 'The signature is a disjoint subset of its parent (subsignatures of one parent do not overlap).',
    'fact': 'A constraint that is assumed to always hold.',
    'pred': 'A named, parameterised formula.',
    'fun': 'A named, parameterised expression.',
    'assert': 'A property to verify with `check`.',
    'run': 'Searches for an instance satisfying a predicate or formula within the scope.',
    'check': 'Searches for a counterexample of an assertion within the scope.',
    'all': 'Universal quantifier: the body holds for every binding.',
    'some': 'In a formula: the set is non-empty, or some binding satisfies the body. In a declaration: at least one.',
    'no': 'The set is empty, or no binding satisfies the body.',
    'lone': 'At most one.',
    'one': 'Exactly one.',
    'set': 'Any number (in declarations).',
    'seq': 'A sequence: a partial function from seq/Int to the element type.',
    'disj': 'The declared variables or fields are pairwise disjoint.',
    'let': 'Binds names to expressions in a body, or declares a macro at the top level.',
    'open': 'Imports a module, optionally instantiating its parameters.',
    'module': 'Names the module and declares its parameters.',
    'enum': 'Declares a signature with one atom per listed value.',
    'var': 'The signature or field may change over time (Alloy 6).',
    'always': 'The formula holds now and in all future states.',
    'eventually': 'The formula holds now or in some future state.',
    'after': 'The formula holds in the next state.',
    'historically': 'The formula held in all past states and holds now.',
    'once': 'The formula held in some past state or holds now.',
    'before': 'The formula held in the previous state.',
    'until': 'The left formula holds until the right one does.',
    'since': 'The left formula has held since the right one did.',
    'releases': 'The right formula holds until and including the state where the left one does.',
    'triggered': 'The right formula has held since and including the state where the left one did.',
    'iden': BUILTINS['iden'],
    'univ': BUILTINS['univ'],
    'none': BUILTINS['none'],
    'Int': BUILTINS['Int'],
    'String': BUILTINS['String'],
    'steps': BUILTINS['steps'],
};

export class AlloyHoverProvider extends AstNodeHoverProvider {

    protected readonly describer: AlloyDescriber;

    constructor(services: AlloyServices) {
        super(services);
        this.describer = new AlloyDescriber(services);
    }

    override async getHoverContent(document: LangiumDocument, params: HoverParams): Promise<Hover | undefined> {
        const root = document.parseResult.value.$cstNode;
        if (!root) return undefined;
        const offset = document.textDocument.offsetAt(params.position);
        const leaf = CstUtils.findLeafNodeAtOffset(root, offset);
        // Builtin names resolve to the module root; describe them by name.
        const node = leaf?.astNode;
        if (node && isQualName(node) && isBuiltinReference(node) && node.ref.ref) {
            const doc = BUILTINS[qualifiedText(node)] ?? BUILTINS[node.ref.$refText];
            if (doc) return markdown(doc);
        }
        const hover = await super.getHoverContent(document, params);
        if (hover) return hover;
        if (leaf && GrammarAST.isKeyword(leaf.grammarSource) && KEYWORDS[leaf.text]) {
            return markdown(`**${leaf.text}**\n\n${KEYWORDS[leaf.text]}`);
        }
        if (node && isAtExpr(node) && node.ref.ref) {
            const content = await this.getAstNodeHoverContent(node.ref.ref);
            return content ? markdown(content) : undefined;
        }
        return undefined;
    }

    protected override getAstNodeHoverContent(node: AstNode): MaybePromise<string | undefined> {
        const description = this.describer.describe(node);
        return description ? formatDescription(description) : undefined;
    }
}

function markdown(value: string): Hover {
    return { contents: { kind: 'markdown', value } };
}

export function formatDescription(description: Description): string {
    let result = '```alloy\n' + description.signature + '\n```';
    if (description.type) result += `\n\nType: \`${description.type}\``;
    if (description.documentation) result += `\n\n${description.documentation}`;
    return result;
}
