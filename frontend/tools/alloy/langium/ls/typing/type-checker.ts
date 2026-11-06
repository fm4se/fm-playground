/**
 * Type checking of Alloy expressions, following the rules of the Alloy Analyzer
 * (edu.mit.csail.sdg.ast.Expr*, Type and CompModule); messages use Alloy's wording.
 *
 * The checker computes the relational type of every expression of a document and reports
 * definite errors only: whenever a type cannot be determined (unresolved names, macros,
 * builtin functions) it is UNKNOWN and compatible with everything. Once a subexpression has
 * an error its type becomes UNKNOWN, so that a mistake is reported only once.
 *
 * Results are cached for the whole workspace, since types depend on imported modules.
 */
import { AstUtils, WorkspaceCache, type AstNode, type AstNodeDescription, type AstNodeLocator, type LangiumDocument, type LangiumDocuments, type ScopeProvider } from 'langium';
import {
    isAlloyModule, isArrowExpr, isAssertDecl, isAtExpr, isBiImplicationExpr, isBinaryTemporalExpr, isBlock, isBoxJoinExpr,
    isBuiltinExpr, isCardinalityExpr, isCmdDecl, isComparisonExpr, isConjunctionExpr, isConst, isDeclName, isDisjunctionExpr,
    isDotJoinExpr, isEnumDecl, isFactDecl, isFieldDecl, isFunDecl, isImplicationExpr, isIntersectionExpr, isLetDecl, isLetExpr,
    isMetaExpr, isModuleDecl, isModuleParam, isMulExpr, isOverrideExpr, isParenExpr, isPredDecl, isPrimeExpr, isQualName,
    isQuantExpr, isRestrictionExpr, isSequenceExpr, isSetExpr, isShiftExpr, isSigDecl, isStringLiteral, isThisExpr, isUnaryExpr,
    isUnaryLogicalExpr, isUnaryMultExpr, isUnionDiffExpr,
    type AlloyModule, type AtExpr, type Block, type BlockOrBar, type BoxJoinExpr, type CmdDecl, type Decl, type DeclName, type Expr,
    type FieldDecl, type FunDecl, type Paragraph, type PredDecl, type QualName, type SigDecl
} from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';
import { AlloyType, INT, NONE, PrimSig, STRING, UNIV } from './alloy-types.js';
import { isBuiltinReference, isSigNode, modulePathOf, qualifiedText, type AlloySigModel } from './sig-model.js';

export interface TypeProblem {
    node: AstNode;
    property?: string;
    index?: number;
    message: string;
    severity: 'error' | 'warning';
}

export interface TypeAnalysis {
    /** Problems found in the analysed document. */
    readonly problems: readonly TypeProblem[];
    /** The type of an expression of the document (computed on demand). */
    typeOf(expr: Expr): AlloyType;
    /** The type of a declaration: a variable, field, parameter, let binding, sig or function result. */
    declaredType(node: AstNode): AlloyType;
    /** Formats a type as Alloy does, relative to the analysed document. */
    format(type: AlloyType): string;
}

export type Callable = PredDecl | FunDecl;

/** Builtin names that denote sets or relations. */
const BUILTIN_TYPES: Record<string, () => AlloyType> = {
    'univ': () => AlloyType.unary(UNIV),
    'Int': () => AlloyType.unary(INT),
    'seq/Int': () => AlloyType.unary(INT),
    'String': () => AlloyType.unary(STRING),
    'none': () => AlloyType.unary(NONE),
    'iden': () => AlloyType.of([[UNIV, UNIV]]),
};

/** Integer functions of util/integer that are always available. */
const INTEGER_FUNCTIONS = new Set(['plus', 'minus', 'mul', 'div', 'rem', 'add', 'sub']);

/** Number of parameters of a predicate or function; a receiver (pred A.p) is an implicit first parameter. */
export function paramCount(callable: Callable): number {
    return (callable.qualifier ? 1 : 0) + (callable.paraDecls?.decls ?? []).reduce((n, d) => n + d.names.length, 0);
}

/** Alloy's label of a predicate or function, e.g. "pred this/show". */
export function callableLabel(callable: Callable, mainUri?: string): string {
    const path = modulePathOf(callable);
    const inMain = AstUtils.getDocument(callable).uri.toString() === mainUri;
    const prefix = path && !inMain ? path : 'this';
    return `${isPredDecl(callable) ? 'pred' : 'fun'} ${prefix}/${callable.name}`;
}

export class AlloyTypeChecker {

    readonly sigModel: AlloySigModel;
    protected readonly cache: WorkspaceCache<string, DocumentAnalysis>;
    protected readonly namesakeCache: WorkspaceCache<string, AstNode[]>;
    protected readonly modulesByPath: WorkspaceCache<string, Map<string, AlloyModule[]>>;
    protected readonly scopeProvider: () => ScopeProvider;
    protected readonly documents: LangiumDocuments;
    protected readonly locator: AstNodeLocator;

    constructor(services: AlloyServices) {
        this.sigModel = services.typing.SigModel;
        this.cache = new WorkspaceCache(services.shared);
        this.namesakeCache = new WorkspaceCache(services.shared);
        this.modulesByPath = new WorkspaceCache(services.shared);
        this.scopeProvider = () => services.references.ScopeProvider;
        this.documents = services.shared.workspace.LangiumDocuments;
        this.locator = services.workspace.AstNodeLocator;
    }

    /** Analyses a document; the result is cached until the workspace changes. */
    analyze(document: LangiumDocument): TypeAnalysis {
        return this.cache.get(document.uri.toString(), () => new DocumentAnalysis(this.sigModel, document, site => this.namesakes(site)).run())!;
    }

    /**
     * Fields, predicates and functions visible under the name of a reference (in the module and
     * its imports). Alloy resolves such overloaded names by type, so the checker considers them all.
     */
    namesakes(site: QualName | AtExpr): AstNode[] {
        const qualifier = isQualName(site) ? site.names.join('/') : '@';
        const key = `${AstUtils.getDocument(site).uri.toString()}|${qualifier}|${site.ref.$refText}`;
        return this.namesakeCache.get(key, () => {
            const scope = this.scopeProvider().getScope({ container: site, property: 'ref', reference: site.ref });
            const result: AstNode[] = [];
            const add = (node: AstNode | undefined) => {
                if (node && (isFieldName(node) || isPredDecl(node) || isFunDecl(node)) && !result.includes(node)) result.push(node);
            };
            for (const description of scope.getAllElements()) {
                if (description.name === site.ref.$refText) add(this.load(description));
            }
            if (qualifier === '' || qualifier === '@') {
                // Unqualified names are also looked up in modules opened indirectly (as CompModule does).
                for (const root of this.reachableModules(AstUtils.findRootNode(site) as AlloyModule)) {
                    for (const node of declarationsNamed(root, site.ref.$refText)) add(node);
                }
            }
            return result;
        })!;
    }

    /** Predicates and functions with the given name in a module and the modules it opens. */
    callablesNamed(module: AlloyModule, name: string): Callable[] {
        return [module, ...this.reachableModules(module)]
            .flatMap(m => declarationsNamed(m, name))
            .filter((n): n is Callable => isPredDecl(n) || isFunDecl(n));
    }

    /** Modules reachable from a module through (possibly nested) open statements. */
    protected reachableModules(root: AlloyModule): AlloyModule[] {
        const byPath = this.modulesByPath.get('all', () => {
            const map = new Map<string, AlloyModule[]>();
            for (const document of this.documents.all) {
                const module = document.parseResult.value;
                if (!isModuleDecl(module)) continue;
                const path = modulePathOf(module)!;
                map.set(path, [...(map.get(path) ?? []), module]);
            }
            return map;
        })!;
        const seen = new Set<AlloyModule>([root]);
        const queue = [root];
        while (queue.length > 0) {
            const module = queue.shift()!;
            for (const open of module.import) {
                for (const target of byPath.get([...open.qualName.names, open.qualName.name].join('/')) ?? []) {
                    if (!seen.has(target)) {
                        seen.add(target);
                        queue.push(target);
                    }
                }
            }
        }
        seen.delete(root);
        return [...seen];
    }

    protected load(description: AstNodeDescription): AstNode | undefined {
        if (description.node) return description.node;
        if (!description.path) return undefined;
        const document = this.documents.getDocument(description.documentUri);
        return document ? this.locator.getAstNode(document.parseResult.value, description.path) : undefined;
    }

    typeOf(expr: Expr): AlloyType {
        return this.analyze(AstUtils.getDocument(expr)).typeOf(expr);
    }

    declaredType(node: AstNode): AlloyType {
        return this.analyze(AstUtils.getDocument(node)).declaredType(node);
    }
}

interface Call {
    /** The reference naming the predicate or function. */
    name: QualName;
    /** All visible predicates/functions with that name (Alloy resolves overloading by arguments). */
    candidates: Callable[];
    args: Expr[];
}

class DocumentAnalysis implements TypeAnalysis {

    readonly problems: TypeProblem[] = [];
    protected readonly root: AlloyModule;
    protected readonly uri: string;
    protected readonly types = new Map<AstNode, AlloyType>();
    protected readonly inProgress = new Set<AstNode>();

    constructor(protected readonly sigModel: AlloySigModel, document: LangiumDocument, protected readonly namesakes: (site: QualName | AtExpr) => AstNode[]) {
        this.root = document.parseResult.value as AlloyModule;
        this.uri = document.uri.toString();
    }

    run(): this {
        for (const paragraph of this.root.paragraph) this.checkParagraph(paragraph);
        return this;
    }

    format(type: AlloyType): string {
        return type.toString(this.uri);
    }

    /******************************************************************************
     * Paragraphs
     ******************************************************************************/

    protected checkParagraph(p: Paragraph): void {
        if (isSigDecl(p)) {
            for (const sig of [p, ...p.additionalSigs]) {
                for (const problem of this.sigModel.info(sig).problems) this.report({ ...problem, severity: 'error' });
            }
            for (const field of p.fields) {
                for (const name of field?.decl.names ?? []) this.declaredType(name);
            }
            if (p.block) this.formulaBlock(p.block);
        } else if (isFactDecl(p) || isAssertDecl(p)) {
            this.formulaBlock(p.block);
        } else if (isPredDecl(p)) {
            this.checkParams(p);
            this.formulaBlock(p.block);
        } else if (isFunDecl(p)) {
            this.checkParams(p);
            this.checkFunctionBody(p);
        } else if (isCmdDecl(p)) {
            for (let cmd: CmdDecl | undefined = p; cmd; cmd = cmd.chainedCmd) {
                if (cmd.block) this.formulaBlock(cmd.block);
            }
        }
    }

    protected checkParams(callable: Callable): void {
        for (const decl of callable.paraDecls?.decls ?? []) {
            for (const name of decl.names) this.declaredType(name);
        }
    }

    protected checkFunctionBody(fun: FunDecl): void {
        const returnType = this.declaredType(fun);
        const statements = fun.block.statements;
        if (statements.length !== 1) {
            this.formulaBlock(fun.block);
            this.error(fun.block, `This must be a set or relation.\nInstead, it has the following possible type(s):\n${this.format(AlloyType.FORMULA)}`);
            return;
        }
        const body = this.asSet(statements[0].expr);
        if (!body.isUnknown && !returnType.isUnknown && returnType.hasTuple() && body.hasTuple() && !body.intersects(returnType)) {
            this.warning(statements[0].expr, 'Function return value is disjoint from its return type.\n'
                + `Function body has type ${this.format(body)}\nbut the return type is ${this.format(returnType)}`);
        }
    }

    protected formulaBlock(block: Block): void {
        for (const statement of block.statements) this.asFormula(statement.expr);
    }

    /******************************************************************************
     * Declarations
     ******************************************************************************/

    declaredType(node: AstNode): AlloyType {
        const cached = this.types.get(node);
        if (cached) return cached;
        if (this.inProgress.has(node)) return AlloyType.UNKNOWN;
        this.inProgress.add(node);
        let type: AlloyType;
        try {
            type = this.computeDeclaredType(node);
        } finally {
            this.inProgress.delete(node);
        }
        this.types.set(node, type);
        return type;
    }

    protected computeDeclaredType(node: AstNode): AlloyType {
        if (isDeclName(node)) {
            const decl = node.$container;
            const bound = this.boundType(decl);
            if (isFieldDecl(decl.$container)) {
                const sigType = this.sigDeclType(decl.$container.$container);
                return sigType.isUnknown || bound.isUnknown ? AlloyType.UNKNOWN : sigType.product(bound);
            }
            return bound;
        }
        if (isLetDecl(node)) return this.typeOf(node.expr);
        if (isSigNode(node)) return this.sigModel.info(node).type;
        if (isModuleParam(node)) return AlloyType.unary(this.sigModel.paramSig(node));
        if (isFunDecl(node)) return this.multiplicityBound(node.returnType);
        return AlloyType.UNKNOWN;
    }

    /** The type bound by a declaration "x: e" or "x = e" (the same for every name of the declaration). */
    protected boundType(decl: Decl): AlloyType {
        const cached = this.types.get(decl);
        if (cached) return cached;
        const type = decl.defined ? this.asSet(decl.expr) : this.multiplicityBound(decl.expr);
        this.types.set(decl, type);
        return type;
    }

    /** Type of a declaration bound, where a top-level set/seq/some/lone/one multiplicity is allowed. */
    protected multiplicityBound(expr: Expr): AlloyType {
        if (!isUnaryMultExpr(expr) || expr.op === 'no') return this.asSet(expr);
        const cached = this.types.get(expr);
        if (cached) return cached;
        const sub = this.asSet(expr.expr);
        let type: AlloyType;
        if (sub.isUnknown) {
            type = sub;
        } else if (expr.op === 'set') {
            type = sub.withoutFlags();
        } else if (expr.op === 'seq') {
            type = AlloyType.unary(INT).product(sub.withoutFlags());
        } else {
            type = sub.extract(1);
            if (type.size === 0) {
                this.error(expr.expr, 'After the some/lone/one multiplicity symbol, this expression must be a unary set.\n'
                    + `Instead, its possible type(s) are:\n${this.format(sub)}`);
                type = AlloyType.UNKNOWN;
            }
        }
        this.types.set(expr, type);
        return type;
    }

    /** Type of all sigs declared together, e.g. "sig A, B { ... }". */
    protected sigDeclType(sig: SigDecl): AlloyType {
        return union([sig, ...sig.additionalSigs].map(s => this.sigModel.info(s).type));
    }

    /******************************************************************************
     * Expressions
     ******************************************************************************/

    typeOf(expr: Expr): AlloyType {
        const cached = this.types.get(expr);
        if (cached) return cached;
        if (this.inProgress.has(expr)) return AlloyType.UNKNOWN;
        this.inProgress.add(expr);
        let type: AlloyType;
        try {
            type = this.compute(expr);
        } finally {
            this.inProgress.delete(expr);
        }
        this.types.set(expr, type);
        return type;
    }

    protected compute(e: Expr): AlloyType {
        if (isQualName(e) || isDotJoinExpr(e) || isBoxJoinExpr(e)) {
            const call = this.callOf(e);
            if (call) return this.isPartOfLargerCall(e) ? AlloyType.UNKNOWN : this.callType(e, call);
        }
        if (isQualName(e)) return this.referenceType(e);
        if (isAtExpr(e)) return this.targetType(e.ref.ref, e, false);
        if (isThisExpr(e)) return this.thisType(e);
        if (isConst(e)) return AlloyType.SMALL_INT;
        if (isStringLiteral(e)) return AlloyType.unary(STRING);
        if (isBuiltinExpr(e)) {
            if (e.name === 'fun/next') return AlloyType.of([[INT, INT]]);
            return e.name === 'pred/totalOrder' ? AlloyType.UNKNOWN : AlloyType.SMALL_INT;
        }
        if (isMetaExpr(e)) return AlloyType.UNKNOWN;
        if (isParenExpr(e) || isPrimeExpr(e)) return this.typeOf(e.expr);
        if (isBlock(e)) {
            this.formulaBlock(e);
            return AlloyType.FORMULA;
        }
        if (isConjunctionExpr(e) || isDisjunctionExpr(e) || isBiImplicationExpr(e) || isBinaryTemporalExpr(e) || isSequenceExpr(e)) {
            this.asFormula(e.left);
            this.asFormula(e.right);
            return AlloyType.FORMULA;
        }
        if (isImplicationExpr(e)) return this.implicationType(e.left, e.right, e.elseExpr, e);
        if (isUnaryLogicalExpr(e)) {
            this.asFormula(e.expr);
            return AlloyType.FORMULA;
        }
        if (isUnaryMultExpr(e)) {
            if (e.op === 'set' || e.op === 'seq') return this.error(e, 'Multiplicity expression not allowed here.');
            this.asSet(e.expr);
            return AlloyType.FORMULA;
        }
        if (isComparisonExpr(e)) return this.comparisonType(e.left, e.op, e.negated, e.right, e);
        if (isShiftExpr(e) || isMulExpr(e)) {
            this.asInt(e.left);
            this.asInt(e.right);
            return AlloyType.SMALL_INT;
        }
        if (isUnionDiffExpr(e)) return this.unionDiffType(e.left, e.op, e.right, e);
        if (isCardinalityExpr(e)) {
            if (e.op === '#') {
                this.asSet(e.expr);
                return AlloyType.SMALL_INT;
            }
            return this.castToInt(e.expr);
        }
        if (isOverrideExpr(e)) {
            const [l, r] = [this.asSet(e.left), this.asSet(e.right)];
            if (l.isUnknown || r.isUnknown) return AlloyType.UNKNOWN;
            const t = l.unionWithCommonArity(r);
            return t.size > 0 ? t : this.error(e, '++ can be used only between two expressions of the same arity.' + this.sides(l, r));
        }
        if (isIntersectionExpr(e)) {
            const [l, r] = [this.asSet(e.left), this.asSet(e.right)];
            if (l.isUnknown || r.isUnknown) return AlloyType.UNKNOWN;
            const t = l.intersect(r);
            if (t.size === 0) return this.error(e, '& can be used only between 2 expressions of the same arity.' + this.sides(l, r));
            if (t.hasNoTuple() && l.hasTuple() && r.hasTuple()) {
                this.warning(e, '& is irrelevant because the two subexpressions are always disjoint.' + this.sides(l, r, true));
            }
            return t;
        }
        if (isArrowExpr(e)) {
            const [l, r] = [this.asSet(e.left), this.asSet(e.right)];
            return l.isUnknown || r.isUnknown ? AlloyType.UNKNOWN : l.withoutFlags().product(r.withoutFlags());
        }
        if (isRestrictionExpr(e)) {
            const [l, r] = [this.asSet(e.left), this.asSet(e.right)];
            if (l.isUnknown || r.isUnknown) return AlloyType.UNKNOWN;
            if (e.op === '<:') {
                const t = r.domainRestrict(l);
                return t.size > 0 ? t : this.error(e.left, `This must be a unary set, but instead it has the following possible type(s):\n${this.format(l)}`);
            }
            const t = l.rangeRestrict(r);
            return t.size > 0 ? t : this.error(e.right, `This must be a unary set, but instead it has the following possible type(s):\n${this.format(r)}`);
        }
        if (isUnaryExpr(e)) {
            const sub = this.asSet(e.expr);
            if (sub.isUnknown) return sub;
            const t = e.op === '~' ? sub.transpose() : sub.closure();
            if (t.size === 0) {
                return this.error(e.expr, `${e.op} can be used only with a binary relation.\nInstead, its possible type(s) are:\n${this.format(sub)}`);
            }
            return e.op === '*' ? AlloyType.of([[UNIV, UNIV]]) : t;
        }
        if (isDotJoinExpr(e)) return this.dotJoinType(e.left, e.right, e);
        if (isBoxJoinExpr(e)) return this.boxJoinType(e);
        if (isQuantExpr(e)) {
            for (const decl of e.decls) this.checkVariableDecl(decl, e.quant === 'sum');
            if (e.quant === 'sum') {
                if (e.blockOrBar.expr) this.asInt(e.blockOrBar.expr);
                else if (e.blockOrBar.block) this.asInt(e.blockOrBar.block);
                return AlloyType.SMALL_INT;
            }
            this.formulaBody(e.blockOrBar);
            return AlloyType.FORMULA;
        }
        if (isSetExpr(e)) {
            let type: AlloyType | undefined;
            for (const decl of e.decls) {
                const bound = this.checkVariableDecl(decl, true).extract(1);
                for (let i = 0; i < decl.names.length; i++) {
                    type = type === undefined ? bound : type.isUnknown || bound.isUnknown ? AlloyType.UNKNOWN : type.product(bound);
                }
            }
            if (e.blockOrBar) this.formulaBody(e.blockOrBar);
            return type ?? AlloyType.UNKNOWN;
        }
        if (isLetExpr(e)) {
            for (const decl of e.decls) this.declaredType(decl);
            return e.blockOrBar.block ? this.typeOf(e.blockOrBar.block) : this.typeOf(e.blockOrBar.expr!);
        }
        return AlloyType.UNKNOWN;
    }

    protected formulaBody(body: BlockOrBar): void {
        if (body.block) this.formulaBlock(body.block);
        else if (body.expr) this.asFormula(body.expr);
    }

    /** Checks the bound of a quantified or comprehension variable; sum and comprehensions need unary sets. */
    protected checkVariableDecl(decl: Decl, unaryOnly: boolean): AlloyType {
        const bound = this.boundType(decl);
        if (decl.defined) {
            this.error(decl.expr, 'This cannot be an exactly-of expression.');
            return AlloyType.UNKNOWN;
        }
        if (bound.isUnknown || !unaryOnly) return bound;
        if (!bound.hasArity(1)) {
            this.error(decl.expr, `This must be a unary set. Instead, its type is ${this.format(bound)}`);
            return AlloyType.UNKNOWN;
        }
        if (isUnaryMultExpr(decl.expr) && decl.expr.op !== 'one') {
            const kind = decl.expr.op === 'some' ? 'some' : decl.expr.op === 'lone' ? 'lone' : 'set';
            this.error(decl.expr, `This cannot be a ${kind}-of expression.`);
        }
        return bound;
    }

    protected implicationType(cond: Expr, then: Expr, otherwise: Expr | undefined, node: Expr): AlloyType {
        this.asFormula(cond);
        if (!otherwise) {
            this.asFormula(then);
            return AlloyType.FORMULA;
        }
        const [a, b] = [this.typeOf(then), this.typeOf(otherwise)];
        if (a.isUnknown || b.isUnknown) return AlloyType.UNKNOWN;
        if (a.isBool && b.isBool) return AlloyType.FORMULA;
        if (a.isSmallInt && b.isSmallInt) return AlloyType.SMALL_INT;
        const t = a.unionWithCommonArity(b);
        if (t.size > 0) return t;
        return this.error(node, 'The then-clause and the else-clause must match.\n'
            + `The then-clause has type: ${this.format(a)}\nand the else-clause has type: ${this.format(b)}`);
    }

    protected comparisonType(left: Expr, op: string, negated: boolean, right: Expr, node: Expr): AlloyType {
        if (op === 'in') {
            const [l, r] = [this.asSet(left), this.multiplicityBound(right)];
            if (!l.isUnknown && !r.isUnknown && !l.hasCommonArity(r)) {
                this.error(node, `${negated ? '!in' : 'in'} can be used only between 2 expressions of the same arity.` + this.sides(l, r));
            }
        } else if (op === '=') {
            const [l, r] = [this.typeOf(left), this.typeOf(right)];
            if (!l.isUnknown && !r.isUnknown && !(l.hasCommonArity(r) || (l.isInt() && r.isInt()))) {
                this.error(node, `${negated ? '!=' : '='} can be used only between 2 expressions of the same arity, or between 2 integer expressions.` + this.sides(l, r));
            }
        } else {
            this.asInt(left);
            this.asInt(right);
        }
        return AlloyType.FORMULA;
    }

    protected unionDiffType(left: Expr, op: string, right: Expr, node: Expr): AlloyType {
        if (op === 'fun/add' || op === 'fun/sub') {
            this.asInt(left);
            this.asInt(right);
            return AlloyType.SMALL_INT;
        }
        const [l, r] = [this.typeOf(left), this.typeOf(right)];
        if (l.isUnknown || r.isUnknown) return AlloyType.UNKNOWN;
        const t = op === '+' ? l.unionWithCommonArity(r) : l.pickCommonArity(r);
        if (t.size > 0) return t;
        return this.error(node, `${op} can be used only between 2 expressions of the same arity, or between 2 integer expressions.` + this.sides(l, r));
    }

    /** int[e], e.int, sum e: the integer value of a unary set of Int atoms. */
    protected castToInt(expr: Expr): AlloyType {
        const sub = this.asSet(expr);
        if (!sub.isUnknown && !sub.hasArity(1)) {
            return this.error(expr, `int[] can be used only with a unary set.\nInstead, its possible type(s) are:\n${this.format(sub)}`);
        }
        return AlloyType.unary(INT);
    }

    protected dotJoinType(left: Expr, right: Expr, node: Expr): AlloyType {
        if (isQualName(right) && isBuiltinReference(right)) {
            const name = qualifiedText(right);
            if (name === 'int' || name === 'sum') return this.castToInt(left);
            if (name === 'Int' && this.typeOf(left).isInt()) return AlloyType.unary(INT);
            if (name === 'disj') {
                this.asSet(left);
                return AlloyType.FORMULA;
            }
        }
        return this.join(left, this.asSet(left), right, this.asSet(right), node);
    }

    protected join(left: Expr, l: AlloyType, right: Expr, r: AlloyType, node: Expr): AlloyType {
        if (l.isUnknown || r.isUnknown) return AlloyType.UNKNOWN;
        const t = l.join(r);
        if (t.size === 0) {
            return this.error(node, 'This cannot be a legal relational join where\n'
                + `left hand side is ${textOf(left)} (type = ${this.format(l)})\n`
                + `right hand side is ${textOf(right)} (type = ${this.format(r)})`);
        }
        if (t.hasNoTuple() && l.hasTuple() && r.hasTuple()) {
            this.warning(node, 'The join operation here always yields an empty set.' + this.sides(l, r, true));
        }
        return t;
    }

    protected boxJoinType(e: BoxJoinExpr): AlloyType {
        const head = e.left;
        if (isQualName(head) && isBuiltinReference(head) && head.ref.ref) {
            const name = qualifiedText(head);
            if (name === 'disj') return this.disjType(e);
            if (name === 'int' || name === 'sum') {
                if (e.indices.length === 1) return this.castToInt(e.indices[0]);
            }
            if (name === 'Int' && e.indices.length === 1 && this.typeOf(e.indices[0]).isInt()) {
                // Int[e] converts an integer expression to its Int atom (CompModule's special case)
                return AlloyType.unary(INT);
            }
            if (INTEGER_FUNCTIONS.has(name)) {
                e.indices.forEach(i => this.asInt(i));
                return AlloyType.SMALL_INT;
            }
        }
        if (isBuiltinExpr(head) && head.name === 'pred/totalOrder') return this.totalOrderType(e);
        let result = this.asSet(head);
        let leftNode: Expr = head;
        for (const index of e.indices) {
            result = this.join(index, this.asSet(index), leftNode, result, e);
            leftNode = e;
        }
        return result;
    }

    protected disjType(e: BoxJoinExpr): AlloyType {
        const types = e.indices.map(i => this.asSet(i));
        if (e.indices.length < 2) {
            this.error(e, 'The builtin disjoint[] predicate must be called with at least two arguments.');
        } else if (types.every(t => !t.isUnknown) && types.some(t => !t.hasCommonArity(types[0]))) {
            this.error(e, 'The builtin predicate disjoint[] cannot be used among expressions of different arities.');
        }
        return AlloyType.FORMULA;
    }

    protected totalOrderType(e: BoxJoinExpr): AlloyType {
        const types = e.indices.map(i => this.asSet(i));
        if (types.length !== 3) {
            this.error(e, 'The builtin pred/totalOrder[] predicate must be called with exactly three arguments.');
        } else {
            const ordinal = ['first', 'second', 'third'];
            [1, 1, 2].forEach((arity, i) => {
                if (!types[i].isUnknown && !types[i].hasArity(arity)) {
                    this.error(e, `The ${ordinal[i]} argument to pred/totalOrder must be ${arity === 1 ? 'unary' : 'binary'}.`);
                }
            });
        }
        return AlloyType.FORMULA;
    }

    /******************************************************************************
     * Names and calls
     ******************************************************************************/

    protected referenceType(name: QualName): AlloyType {
        const target = name.ref.ref;
        if (!target) return AlloyType.UNKNOWN;
        if (isBuiltinReference(name)) return BUILTIN_TYPES[qualifiedText(name)]?.() ?? AlloyType.UNKNOWN;
        return this.targetType(target, name, true);
    }

    /** Type of a reference to a declaration; a field of the enclosing sig may stand for this.field. */
    protected targetType(target: AstNode | undefined, site: AstNode, implicitThis: boolean): AlloyType {
        if (!target || isAlloyModule(target)) return AlloyType.UNKNOWN;
        if (isFieldName(target)) {
            // Fields of different sigs may share a name; Alloy picks the one that type checks.
            const fields = isQualName(site) || isAtExpr(site) ? this.namesakes(site).filter(isFieldName) : [];
            return union((fields.includes(target) ? fields : [target, ...fields]).map(field => {
                const type = this.instantiate(this.declaredType(field), field, site);
                return implicitThis ? this.withImplicitThis(type, (field.$container.$container as FieldDecl).$container, site) : type;
            }));
        }
        if (isDeclName(target) || isSigNode(target)) {
            return this.instantiate(this.declaredType(target), target, site);
        }
        if (isModuleParam(target) || isLetDecl(target)) return this.declaredType(target);
        return AlloyType.UNKNOWN;
    }

    /**
     * Inside the fields and facts of a sig, a field of that sig (or of an ancestor) can mean
     * this.field or the whole relation; Alloy picks the reading that type checks. The type
     * is the union of both readings, so that operations on either one are accepted.
     */
    protected withImplicitThis(fieldType: AlloyType, fieldSig: SigDecl, site: AstNode): AlloyType {
        const here = AstUtils.getContainerOfType(site, isSigDecl);
        if (!here || fieldType.isUnknown) return fieldType;
        const owners = [fieldSig, ...fieldSig.additionalSigs];
        if (!owners.some(owner => this.sigModel.isSameOrDescendant(here, owner))) return fieldType;
        const thisType = this.sigDeclType(here);
        if (thisType.isUnknown) return AlloyType.UNKNOWN;
        return thisType.join(fieldType).merge(fieldType);
    }

    protected thisType(node: AstNode): AlloyType {
        const sig = AstUtils.getContainerOfType(node, isSigDecl);
        if (sig) return this.sigDeclType(sig);
        const callable = AstUtils.getContainerOfType(node, (n): n is Callable => isPredDecl(n) || isFunDecl(n));
        if (callable?.qualifier) return this.sigModel.typeOfSigReference(callable.qualifier) ?? AlloyType.UNKNOWN;
        return this.error(node, 'The name "this" cannot be found.');
    }

    /** Instantiates the parameters of the module declaring `target` with the arguments of the open statement. */
    protected instantiate(type: AlloyType, target: AstNode, site: AstNode): AlloyType {
        const targetRoot = AstUtils.findRootNode(target);
        if (type.isUnknown || !isModuleDecl(targetRoot) || targetRoot.params.length === 0 || targetRoot === this.root) return type;
        const path = [...targetRoot.qualName.names, targetRoot.qualName.name].join('/');
        let imports = this.root.import.filter(i => [...i.qualName.names, i.qualName.name].join('/') === path);
        if (imports.length > 1 && isQualName(site) && site.names.length === 1) {
            imports = imports.filter(i => i.alias === site.names[0]);
        }
        if (imports.length !== 1) return type;
        const args = imports[0].args;
        const params = new Map<PrimSig, AlloyType>();
        targetRoot.params.forEach((param, i) => {
            const arg = args[i] ? this.sigModel.typeOfSigReference(args[i]) : undefined;
            if (arg) params.set(this.sigModel.paramSig(param), arg);
        });
        return type.substitute(params);
    }

    /** Recognises calls: p, p[a, b], a.p, a.p[b] (a predicate or function applied to arguments). */
    protected callOf(e: Expr): Call | undefined {
        if (isQualName(e)) {
            const target = e.ref.ref;
            if (!isPredDecl(target) && !isFunDecl(target)) return undefined;
            const candidates = this.namesakes(e).filter((n): n is Callable => isPredDecl(n) || isFunDecl(n));
            return { name: e, candidates: candidates.includes(target) ? candidates : [target, ...candidates], args: [] };
        }
        if (isDotJoinExpr(e)) {
            const inner = isQualName(e.right) ? this.callOf(e.right) : undefined;
            return inner && maxParams(inner) > 0 ? { ...inner, args: [e.left] } : undefined;
        }
        if (isBoxJoinExpr(e)) {
            const inner = this.callOf(e.left);
            return inner && inner.args.length < maxParams(inner) ? { ...inner, args: [...inner.args, ...e.indices] } : undefined;
        }
        return undefined;
    }

    protected isPartOfLargerCall(e: Expr): boolean {
        const parent = e.$container;
        return ((isBoxJoinExpr(parent) && parent.left === e) || (isDotJoinExpr(parent) && parent.right === e))
            && this.callOf(parent) !== undefined;
    }

    /**
     * Type of a call. Among the candidates Alloy picks one whose parameters fit the arguments;
     * a function with fewer parameters is applied to the first arguments and its result joined
     * with the rest (f[a][b]); an integer function such as add may be meant instead of a
     * user predicate of the same name.
     */
    protected callType(site: Expr, call: Call): AlloyType {
        const argTypes = call.args.map(a => this.asSet(a));
        const n = call.args.length;
        const exact = call.candidates.filter(c => paramCount(c) === n);
        const partial = call.candidates.filter(c => isFunDecl(c) && paramCount(c) < n).sort((a, b) => paramCount(b) - paramCount(a));
        const fitting = exact.filter(c => this.argumentsFit(c, argTypes, site));
        if (fitting.length > 1 && fitting.every(isFunDecl)) {
            // Several functions fit (e.g. "next" of util/ordering and of util/integer): like Alloy's
            // ExprChoice, keep all readings and let the enclosing expression pick.
            return union(fitting.map(c => this.instantiate(this.declaredType(c), c, call.name)));
        }
        let callee: Callable | undefined = fitting[0] ?? partial.find(c => this.partialFits(c, argTypes, call, site));
        if (!callee && INTEGER_FUNCTIONS.has(call.name.ref.$refText) && n === 2 && argTypes.every(t => t.isUnknown || t.isInt())) {
            return AlloyType.SMALL_INT;
        }
        // Report the arguments of a candidate with the right number of parameters; a function with
        // fewer parameters that does not fit gives a clearer arity error than a failed join.
        callee ??= exact[0];
        if (!callee) {
            const first = call.candidates[0];
            return this.error(site, `${callableLabel(first, this.uri)} has ${paramCount(first)} parameters but is called with ${n} arguments.`);
        }
        const extra = call.args.slice(paramCount(callee));
        const params = this.paramTypes(callee, site);
        params.forEach((param, i) => {
            const arity = param.arity();
            const arg = argTypes[i];
            if (arity !== undefined && !param.isUnknown && arg && !arg.isUnknown && !arg.hasArity(arity)) {
                this.error(call.args[i], `This should have arity ${arity} but instead its possible type(s) are ${this.format(arg)}`);
            }
        });
        let result = isPredDecl(callee) ? AlloyType.FORMULA : this.instantiate(this.declaredType(callee), callee, call.name);
        for (const arg of extra) {
            result = this.join(arg, this.asSet(arg), call.name, result, site);
        }
        return result;
    }

    protected paramTypes(callable: Callable, site: AstNode): AlloyType[] {
        const receiver = callable.qualifier ? [this.sigModel.typeOfSigReference(callable.qualifier) ?? AlloyType.UNKNOWN] : [];
        const params = (callable.paraDecls?.decls ?? []).flatMap(decl => decl.names.map((name: DeclName) => this.declaredType(name)));
        return [...receiver, ...params].map(type => this.instantiate(type, callable, site));
    }

    /** True if a function with fewer parameters fits its arguments and its result joins with the rest. */
    protected partialFits(callable: Callable, args: AlloyType[], call: Call, site: AstNode): boolean {
        const count = paramCount(callable);
        if (!this.argumentsFit(callable, args.slice(0, count), site)) return false;
        let result = this.instantiate(this.declaredType(callable), callable, call.name);
        for (const arg of args.slice(count)) {
            if (result.isUnknown || arg.isUnknown) return true;
            result = arg.join(result);
            if (!result.hasTuple()) return false;
        }
        return true;
    }

    protected argumentsFit(callable: Callable, args: AlloyType[], site: AstNode): boolean {
        return this.paramTypes(callable, site).every((param, i) => {
            const arg = args[i];
            if (!arg || arg.isUnknown || param.isUnknown) return true;
            return arg.hasCommonArity(param) && (arg.intersects(param) || !arg.hasTuple());
        });
    }

    /******************************************************************************
     * Expected kinds of expressions
     ******************************************************************************/

    protected asFormula(e: Expr): AlloyType {
        const t = this.typeOf(e);
        if (t.isUnknown || t.isBool) return t;
        return this.error(e, `This must be a formula expression.\nInstead, it has the following possible type(s):\n${this.format(t)}`);
    }

    protected asSet(e: Expr): AlloyType {
        const t = this.typeOf(e);
        if (t.isUnknown || t.isSet()) return t;
        return this.error(e, `This must be a set or relation.\nInstead, it has the following possible type(s):\n${this.format(t)}`);
    }

    protected asInt(e: Expr): AlloyType {
        const t = this.typeOf(e);
        if (t.isUnknown || t.isInt()) return t;
        return this.error(e, `This must be an integer expression.\nInstead, it has the following possible type(s):\n${this.format(t)}`);
    }

    /** The operand types appended to binary operator messages; warnings show only the relational part (as Alloy does). */
    protected sides(l: AlloyType, r: AlloyType, warning = false): string {
        const [a, b] = warning ? [l.withoutFlags(), r.withoutFlags()] : [l, r];
        return `\nLeft type = ${this.format(a)}\nRight type = ${this.format(b)}`;
    }

    /******************************************************************************
     * Problems
     ******************************************************************************/

    /** Reports an error and returns UNKNOWN, so that the error does not propagate. */
    protected error(node: AstNode, message: string): AlloyType {
        this.report({ node, message, severity: 'error' });
        return AlloyType.UNKNOWN;
    }

    protected warning(node: AstNode, message: string): void {
        this.report({ node, message, severity: 'warning' });
    }

    /** Records problems of the analysed document only; other documents report their own. */
    protected report(problem: TypeProblem): void {
        if (AstUtils.findRootNode(problem.node) !== this.root) return;
        if (this.problems.some(p => p.node === problem.node && p.message === problem.message)) return;
        this.problems.push(problem);
    }
}

/** Fields, predicates and functions of a module with the given name. */
function declarationsNamed(module: AlloyModule, name: string): AstNode[] {
    const result: AstNode[] = [];
    for (const p of module.paragraph) {
        if ((isPredDecl(p) || isFunDecl(p)) && p.name === name) result.push(p);
        if (isSigDecl(p)) result.push(...p.fields.flatMap(f => f?.decl.names ?? []).filter(n => n.name === name));
    }
    return result;
}

function isFieldName(node: unknown): node is DeclName {
    return isDeclName(node) && isFieldDecl(node.$container.$container);
}

function maxParams(call: Call): number {
    return Math.max(...call.candidates.map(paramCount));
}

function union(types: AlloyType[]): AlloyType {
    if (types.some(t => t.isUnknown)) return AlloyType.UNKNOWN;
    return types.reduce((a, b) => a.merge(b), AlloyType.EMPTY);
}

/** Source text of an expression with whitespace collapsed (used in messages). */
export function textOf(node: AstNode): string {
    return node.$cstNode?.text.replace(/\s+/g, ' ').trim() ?? '';
}

/** True for declarations whose type the checker can describe. */
export function hasDeclaredType(node: AstNode): boolean {
    return isDeclName(node) || isLetDecl(node) || isSigNode(node) || isModuleParam(node) || isFunDecl(node) || isEnumDecl(node);
}
