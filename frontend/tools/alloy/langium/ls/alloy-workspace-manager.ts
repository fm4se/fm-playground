import { DefaultWorkspaceManager, type LangiumDocument, type LangiumDocumentFactory, URI } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';
import type { WorkspaceFolder } from 'vscode-languageserver-protocol';

/**
 * Standard library module definitions for the Alloy language.
 * 
 * Each entry maps a module path (as used in `open` statements) to the
 * content of the corresponding standard library `.als` file.
 * 
 * These are embedded directly in the source to avoid filesystem path
 * resolution issues across different runtime environments (VS Code extension,
 * CLI, tests with EmptyFileSystem, etc.).
 */
const STANDARD_LIBRARY_MODULES: Record<string, string> = {
    'util/ordering': `module util/ordering[exactly elem]

private one sig Ord {
   First: set elem,
   Next: elem->elem
} {
   pred/totalOrder[elem,First,Next]
}

fun first: one elem { Ord.First }

fun last: one elem { elem - (next.elem) }

fun prev : elem->elem { ~(Ord.Next) }

fun next : elem->elem { Ord.Next }

fun prevs [e: elem]: set elem { e.^(~(Ord.Next)) }

fun nexts [e: elem]: set elem { e.^(Ord.Next) }

pred lt [e1, e2: elem] { e1 in prevs[e2] }

pred gt [e1, e2: elem] { e1 in nexts[e2] }

pred lte [e1, e2: elem] { e1=e2 || lt [e1,e2] }

pred gte [e1, e2: elem] { e1=e2 || gt [e1,e2] }

fun larger [e1, e2: elem]: elem { lt[e1,e2] => e2 else e1 }

fun smaller [e1, e2: elem]: elem { lt[e1,e2] => e1 else e2 }

fun max [es: set elem]: lone elem { es - es.^(~(Ord.Next)) }

fun min [es: set elem]: lone elem { es - es.^(Ord.Next) }
`,

    'util/boolean': `module util/boolean

one sig True, False in Bool {}

sig Bool {}

pred isTrue [b: Bool] { b in True }

pred isFalse [b: Bool] { b in False }

fun Not [b: Bool]: Bool { Bool - b }

fun And [a, b: Bool]: Bool { a & b }

fun Or [a, b: Bool]: Bool { a + b }

fun Xor [a, b: Bool]: Bool { (a + b) - (a & b) }

fun Nand [a, b: Bool]: Bool { Not[And[a,b]] }

fun Nor [a, b: Bool]: Bool { Not[Or[a,b]] }
`,

    'util/relation': `module util/relation

pred irreflexive [r: univ->univ] { no iden & r }

pred acyclic [r: univ->univ, s: set univ] { all x: s | x !in x.^r }

pred complete [r: univ->univ, s: set univ] { all x,y: s | x!=y implies x->y in (r + ~r) }

fun dom [r: univ->univ]: set univ { r.univ }

fun ran [r: univ->univ]: set univ { univ.r }

pred total [r: univ->univ, pre: set univ] { all x: pre | some x.r }

pred functional [r: univ->univ, pre: set univ] { all x: pre | lone x.r }

pred function [r: univ->univ, pre: set univ] { all x: pre | one x.r }

pred surjective [r: univ->univ, post: set univ] { all x: post | some r.x }

pred injective [r: univ->univ, post: set univ] { all x: post | lone r.x }

pred bijective [r: univ->univ, post: set univ] { all x: post | one r.x }

pred bijection [r: univ->univ, pre, post: set univ] { function[r,pre] and bijective[r,post] }

pred totalOrder [r: univ->univ, s: set univ, first, last: s] {
  s in first.*r
  no last.r
  all x: s - last | one x.r
}
`,

    'util/integer': `module util/integer

fun add [n1, n2: Int]: Int { int[plus[n1, n2]] }

fun sub [n1, n2: Int]: Int { int[minus[n1, n2]] }

fun mul [n1, n2: Int]: Int { int[mul[n1, n2]] }

fun div [n1, n2: Int]: Int { int[div[n1, n2]] }

fun rem [n1, n2: Int]: Int { int[rem[n1, n2]] }

fun negate [n: Int]: Int { int[negate[n]] }

fun signum [n: Int]: Int { n<0 => -1 else (n>0 => 1 else 0) }

fun max [n1, n2: Int]: Int { n1>=n2 => n1 else n2 }

fun min [n1, n2: Int]: Int { n1<=n2 => n1 else n2 }

fun next [n: Int]: Int { int[plus[n, 1]] }

fun prev [n: Int]: Int { int[minus[n, 1]] }

pred larger [n1, n2: Int] { int[n1] > int[n2] }

pred smaller [n1, n2: Int] { int[n1] < int[n2] }

pred positive [n: Int] { int[n] > 0 }

pred negative [n: Int] { int[n] < 0 }

pred nonpositive [n: Int] { int[n] <= 0 }

pred nonnegative [n: Int] { int[n] >= 0 }

fun zero: one Int { 0 }
`,

    'util/graph': `module util/graph[node]

pred dag [r: node->node] {
  all n: node | n !in n.^r
}

pred noSelfLoops [r: node->node] {
  no iden & r
}

pred undirected [r: node->node] {
  r = ~r
}

pred stronglyConnected [r: node->node] {
  all n1, n2: node | n1 in n2.*r
}

pred weaklyConnected [r: node->node] {
  all n1, n2: node | n1 in n2.*(r + ~r)
}

pred rootedAt [r: node->node, root: node] {
  node in root.*r
}

pred ring [r: node->node] {
  all n: node | one n.r
  all n: node | node in n.*r
}

pred tree [r: node->node] {
  one root: node | rootedAt[r, root] and dag[r] and (all n: node - root | one r.n)
}

pred forest [r: node->node] {
  dag[r] and (all n: node | lone r.n)
}

pred innerNodes [r: node->node]: set node { {n: node | some n.r} }

fun leaves [r: node->node]: set node { node - innerNodes[r] }
`,

    'util/natural': `module util/natural

private open util/ordering[Natural] as ord

sig Natural {}

fun add [m, n: Natural]: Natural {
  (n = ord/first) => m else add[ord/next[m], ord/prev[n]]
}

fun sub [m, n: Natural]: Natural {
  (n = ord/first) => m else sub[ord/prev[m], ord/prev[n]]
}

fun mul [m, n: Natural]: Natural {
  (n = ord/first) => ord/first else add[m, mul[m, ord/prev[n]]]
}

pred eq [m, n: Natural] { m = n }

pred gt [m, n: Natural] { ord/gt[m, n] }

pred lt [m, n: Natural] { ord/lt[m, n] }

pred gte [m, n: Natural] { ord/gte[m, n] }

pred lte [m, n: Natural] { ord/lte[m, n] }

fun zero: Natural { ord/first }
`,

    'util/sequence': `module util/sequence[elem]

private open util/ordering[SeqIdx] as ord

sig SeqIdx {}

fun first: SeqIdx { ord/first }

fun last [s: SeqIdx -> elem]: SeqIdx { ord/max[s.elem] }

fun lastIdx: SeqIdx { ord/last }

fun inds [s: SeqIdx -> elem]: set SeqIdx { s.elem }

fun elems [s: SeqIdx -> elem]: set elem { SeqIdx.s }

fun indsOf [s: SeqIdx -> elem, e: elem]: set SeqIdx { s.e }

fun isEmpty [s: SeqIdx -> elem]: set SeqIdx { no s }

fun at [s: SeqIdx -> elem, i: SeqIdx]: lone elem { i.s }

fun add [s: SeqIdx -> elem, e: elem]: SeqIdx -> elem {
  s + (ord/next[last[s]] -> e)
}

fun setAt [s: SeqIdx -> elem, i: SeqIdx, e: elem]: SeqIdx -> elem {
  s ++ (i -> e)
}

fun idxOf [s: SeqIdx -> elem, e: elem]: lone SeqIdx { ord/min[indsOf[s, e]] }

fun lastIdxOf [s: SeqIdx -> elem, e: elem]: lone SeqIdx { ord/max[indsOf[s, e]] }

fun hasDups [s: SeqIdx -> elem] { # elems[s] < # inds[s] }

fun afterLastIdx [s: SeqIdx -> elem]: lone SeqIdx { ord/next[last[s]] }

fun subseq [s: SeqIdx -> elem, from, to: SeqIdx]: SeqIdx -> elem {
  (SeqIdx <: ord/prevs[from]).s + (SeqIdx <: ord/nexts[to]).s
}

fun rest [s: SeqIdx -> elem]: SeqIdx -> elem { subseq[s, ord/next[first], last[s]] }

fun butlast [s: SeqIdx -> elem]: SeqIdx -> elem { subseq[s, first, ord/prev[last[s]]] }

fun append [s1, s2: SeqIdx -> elem]: SeqIdx -> elem {
  let shift = {i, j: SeqIdx | # ord/prevs[j] = plus[# ord/prevs[i], # inds[s1]]} |
  s1 + shift.s2
}
`,

    'util/time': `module util/time

open util/ordering[Time]

sig Time {}
`,

    'util/ternary': `module util/ternary

fun select [p: univ->univ->univ, i: univ, j: univ]: set univ { i.p[j] }

fun select12 [p: univ->univ->univ, i: univ, j: univ]: set univ { i.p[j] }

fun select13 [p: univ->univ->univ, i: univ, k: univ]: set univ { (i.p).k }

fun select23 [p: univ->univ->univ, j: univ, k: univ]: set univ { p.k.j }
`,

    'util/seqrel': `module util/seqrel

open util/ordering[SeqIdx] as ord

sig SeqIdx {}
`,

    'util/sequniv': `module util/sequniv

private open util/integer as ui
`
};

/**
 * Custom workspace manager for the Alloy language that automatically loads
 * standard library modules (util/ordering, util/boolean, etc.) as built-in
 * documents so they are available for cross-file reference resolution.
 * 
 * The standard library files are embedded as in-memory strings to ensure
 * they work across all environments (VS Code extension, CLI, tests).
 */
export class AlloyWorkspaceManager extends DefaultWorkspaceManager {

    private readonly documentFactory: LangiumDocumentFactory;

    constructor(services: LangiumSharedServices) {
        super(services);
        this.documentFactory = services.workspace.LangiumDocumentFactory;
    }

    /**
     * Load Alloy standard library modules as additional documents.
     * These are created from embedded strings with synthetic URIs
     * (builtin:///util/ordering.als, etc.) so they are always available
     * in the document index regardless of the workspace folder configuration.
     */
    protected override async loadAdditionalDocuments(
        _folders: WorkspaceFolder[],
        collector: (document: LangiumDocument) => void
    ): Promise<void> {
        for (const [modulePath, content] of Object.entries(STANDARD_LIBRARY_MODULES)) {
            const uri = URI.parse(`builtin:///${modulePath}.als`);
            if (!this.langiumDocuments.hasDocument(uri)) {
                const document = this.documentFactory.fromString(content, uri);
                collector(document);
            }
        }
    }
}
