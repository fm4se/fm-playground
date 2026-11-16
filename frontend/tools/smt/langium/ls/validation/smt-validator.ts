import { DiagnosticTag } from 'vscode-languageserver';
import { AstUtils, DocumentCache, type AstNode, type LangiumDocument, type ValidationAcceptor, type ValidationChecks } from 'langium';
import {
    isAnnotatedTerm, isConstructorDec, isDeclareConst, isDeclareFun, isDeclareRel, isDeclareVar, isDefineConst, isFunctionDec,
    isDeclareDatatypes, isFunctionDef, isIndexedSort, isLegacyDatatypeDec, isLambdaTerm, isLetTerm, isNamedAttribute, isParametricSort, isPatternVariable,
    isQuantifiedTerm, isSetLogic, isSExprConstant, isSExprSymbol, isSelectorDec, isSimpleIdentifier, isSortedVar, isSymbolIndex, isVarBinding,
    type AttributeValue, type DeclareDatatype, type DeclareDatatypes, type DeclareSort, type DefineFunsRec, type GenericCommand,
    type GetOption, type IndexedIdentifier, type IndexedSort, type NamedAttribute, type ParametricSort, type Pop, type Push,
    type Script, type SetInfo, type SetLogic, type SetOption, type SimpleSort, type SmtAstType, type SortIdentifier, type SortedVar,
    type VarBinding, type Command
} from '../generated/ast.js';
import { findCommandSpec, isKnownGenericCommand } from '../builtins/commands.js';
import { findOption, isKnownLogic, STATUS_VALUES } from '../builtins/options.js';
import type { SmtServices } from '../smt-module.js';
import type { SmtScopeProvider } from '../scoping/smt-scope-provider.js';
import type { GlobalSymbol } from '../scoping/symbol-table.js';
import type { SmtParseResult } from '../smt-parser.js';
import { indexValue, type SortChecker } from '../typing/sort-checker.js';
import { sortToString } from '../typing/sorts.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: SmtServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.SmtValidator;
    const checks: ValidationChecks<SmtAstType> = {
        Script: [validator.checkScript],
        GenericCommand: validator.checkGenericCommand,
        SetOption: validator.checkSetOption,
        GetOption: validator.checkGetOption,
        SetInfo: validator.checkSetInfo,
        SetLogic: validator.checkSetLogic,
        Push: validator.checkStackCommand,
        Pop: validator.checkStackCommand,
        DeclareSort: validator.checkDeclareSort,
        DeclareDatatypes: validator.checkDeclareDatatypes,
        DeclareDatatype: validator.checkDeclareDatatype,
        DefineFunsRec: validator.checkDefineFunsRec,
        SimpleSort: validator.checkSortArity,
        IndexedSort: validator.checkSortArity,
        ParametricSort: validator.checkSortArity,
        IndexedIdentifier: validator.checkIndexedIdentifier,
        NamedAttribute: validator.checkNamedAttribute,
        SortedVar: validator.checkUnusedLocal,
        VarBinding: validator.checkUnusedLocal,
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class SmtValidator {

    protected readonly sortChecker: SortChecker;
    protected readonly scopeProvider: SmtScopeProvider;
    protected readonly services: SmtServices;

    constructor(services: SmtServices) {
        this.services = services;
        this.sortChecker = services.typing.SortChecker;
        this.scopeProvider = services.references.ScopeProvider as SmtScopeProvider;
        this.usedTargetsCache = new DocumentCache(services.shared);
    }

    protected readonly usedTargetsCache: DocumentCache<string, Set<AstNode>>;

    protected isBuiltin(node: AstNode): boolean {
        return this.services.builtins.BuiltinLibrary.isBuiltinDocument(AstUtils.getDocument(node));
    }

    /******************************************************************************
     * Whole script
     ******************************************************************************/

    checkScript(script: Script, accept: ValidationAcceptor): void {
        if (this.isBuiltin(script)) return;
        const document = AstUtils.getDocument(script);

        // Terms skipped by the parser because they are nested too deeply.
        for (const range of (document.parseResult as SmtParseResult).truncated ?? []) {
            accept('warning', 'This term is nested too deeply to be analysed by the language server; it is skipped.', {
                node: script,
                range: { start: document.textDocument.positionAt(range.start), end: document.textDocument.positionAt(range.end) }
            });
        }

        // Sort errors.
        for (const problem of this.sortChecker.analyze(document).problems) {
            accept(problem.severity, problem.message, { node: problem.node, property: problem.property, index: problem.index });
        }

        // Assertion stack problems and duplicate declarations.
        const table = this.scopeProvider.getSymbolTable(document);
        for (const problem of table.stackProblems) {
            accept('error', problem.message, { node: problem.command });
        }
        for (const symbol of table.symbols) {
            this.checkDuplicate(symbol, table.lookup(symbol.name, symbol.namespace, symbol.from), accept);
        }
        this.checkUnusedGlobals(document, table.symbols, accept);
    }

    protected checkDuplicate(symbol: GlobalSymbol, visible: GlobalSymbol[], accept: ValidationAcceptor): void {
        // Only earlier declarations are reported as conflicting, so each duplicate is flagged once.
        const others = visible.filter(o => o !== symbol && this.precedes(o.node, symbol.node));
        const property = 'name';
        if (symbol.namespace === 'sort') {
            if (others.length > 0) {
                accept('error', `Sort '${symbol.name}' is already declared.`, { node: symbol.node, property });
            } else if (!isSortParameterLike(symbol.node)) {
                const spec = this.services.builtins.BuiltinLibrary.getSortSpec(symbol.name);
                if (spec && !spec.z3Only) {
                    accept('error', `'${symbol.name}' is a builtin sort and cannot be redeclared.`, { node: symbol.node, property });
                } else if (spec && this.z3ExtrasActive(symbol.command)) {
                    accept('warning', `'${symbol.name}' shadows a Z3 builtin sort (${spec.theory}).`, { node: symbol.node, property });
                }
            }
            return;
        }
        const signature = this.sortChecker.signatureOf(symbol.node as never);
        const key = signature ? signature.params.map(sortToString).join(' ') : undefined;
        for (const other of others) {
            const otherSignature = this.sortChecker.signatureOf(other.node as never);
            const otherKey = otherSignature ? otherSignature.params.map(sortToString).join(' ') : undefined;
            if (key === undefined || otherKey === undefined || key === otherKey) {
                const what = isNamedAttribute(symbol.node) ? 'Name' : signature && signature.params.length > 0 ? 'Function' : 'Symbol';
                accept('error', `${what} '${symbol.name}' is already declared${key ? ' with the same argument sorts' : ''}.`, { node: symbol.node, property });
                return;
            }
        }
        if (signature && !isSortedVar(symbol.node)) {
            const builtin = this.sortChecker.builtinAccepts(symbol.name, signature.params);
            // Z3's predefined List constructors are ordinary declarations that can be overloaded.
            if (builtin && builtin.theory !== 'Z3 Datatypes') {
                const message = `'${symbol.name}' is a builtin symbol (${builtin.theory}) with the same argument sorts and cannot be redeclared.`;
                if (!builtin.z3Only) accept('error', message, { node: symbol.node, property });
                else if (this.z3ExtrasActive(symbol.command)) accept('warning', message, { node: symbol.node, property });
            }
        }
    }

    /**
     * Z3 registers most of its extra symbols (and the predefined List datatype) only when
     * no logic is set or the logic is ALL.
     */
    protected z3ExtrasActive(command: Command): boolean {
        const script = command.$container as Script;
        const index = script.commands.indexOf(command);
        const logic = script.commands.slice(0, index).reverse().find(isSetLogic)?.logic;
        return logic === undefined || logic === 'ALL';
    }

    private precedes(a: AstNode, b: AstNode): boolean {
        return (a.$cstNode?.offset ?? 0) < (b.$cstNode?.offset ?? 0);
    }

    /** Unused global declarations are shown as faded hints. */
    protected checkUnusedGlobals(document: LangiumDocument, symbols: GlobalSymbol[], accept: ValidationAcceptor): void {
        const used = this.usedTargets(document);
        for (const symbol of symbols) {
            const node = symbol.node;
            const declares = isDeclareConst(node) || isDeclareFun(node) || isDefineConst(node) || isFunctionDef(node)
                || isDeclareRel(node) || isDeclareVar(node);
            if (declares && !used.has(node)) {
                accept('hint', `'${symbol.name}' is declared but never used.`, { node, property: 'name', tags: [DiagnosticTag.Unnecessary] });
            }
        }
    }

    /** Targets of all resolved references of a document, computed once per document version. */
    protected usedTargets(document: LangiumDocument): Set<AstNode> {
        return this.usedTargetsCache.get(document.uri, 'used', () => {
            const used = new Set<AstNode>();
            for (const reference of document.references) {
                const target = 'ref' in reference ? reference.ref : undefined;
                if (target) used.add(target);
            }
            return used;
        });
    }

    checkUnusedLocal(node: SortedVar | VarBinding, accept: ValidationAcceptor): void {
        if (this.isBuiltin(node)) return;
        const container = node.$container;
        // Only quantified / lambda variables and let bindings: function parameters are part of the signature.
        if (isSortedVar(node) && !(isQuantifiedTerm(container) || isLambdaTerm(container))) return;
        if (isVarBinding(node) && !isLetTerm(container)) return;
        const document = AstUtils.getDocument(node);
        if (document.parseResult.parserErrors.length > 0) return;
        if (!this.usedTargets(document).has(node)) {
            accept('hint', `'${node.name}' is never used.`, { node, property: 'name', tags: [DiagnosticTag.Unnecessary] });
        }
    }

    /******************************************************************************
     * Commands
     ******************************************************************************/

    checkGenericCommand(command: GenericCommand, accept: ValidationAcceptor): void {
        if (findCommandSpec(command.name) || isKnownGenericCommand(command.name)) return;
        const suggestion = closest(command.name, ['assert', 'check-sat', 'declare-const', 'declare-fun', 'define-fun', 'get-model', 'get-value', 'set-option', 'set-logic', 'set-info', 'push', 'pop', 'echo', 'exit', 'get-unsat-core', 'reset']);
        accept('error', `Unknown command '${command.name}'.${suggestion ? ` Did you mean '${suggestion}'?` : ''}`, { node: command, property: 'name' });
    }

    checkSetOption(command: SetOption, accept: ValidationAcceptor): void {
        const attribute = command.attribute;
        if (!attribute) return;
        const option = findOption(attribute.keyword);
        if (!option) {
            accept('warning', `Unknown option '${attribute.keyword}'.`, { node: attribute, property: 'keyword' });
            return;
        }
        const value = attribute.value;
        if (!value) {
            accept('error', `Option '${attribute.keyword}' requires a value.`, { node: attribute, property: 'keyword' });
            return;
        }
        const problem = checkOptionValue(option.type, value);
        if (problem) accept('error', `Option '${attribute.keyword}' expects ${problem}.`, { node: value });
    }

    checkGetOption(command: GetOption, accept: ValidationAcceptor): void {
        if (command.option && !findOption(command.option)) {
            accept('warning', `Unknown option '${command.option}'.`, { node: command, property: 'option' });
        }
    }

    checkSetInfo(command: SetInfo, accept: ValidationAcceptor): void {
        const attribute = command.attribute;
        if (!attribute) return;
        const value = attribute.value;
        if (attribute.keyword === ':status') {
            if (!value || !isSExprSymbol(value) || !STATUS_VALUES.includes(value.value)) {
                accept('error', "':status' must be one of sat, unsat or unknown.", { node: value ?? attribute });
            }
        } else if (attribute.keyword === ':smt-lib-version') {
            if (!value || !isSExprConstant(value) || !/^\d+(\.\d+)?$/.test(value.value)) {
                accept('error', "':smt-lib-version' must be a version number such as 2.7.", { node: value ?? attribute });
            }
        }
    }

    checkSetLogic(command: SetLogic, accept: ValidationAcceptor): void {
        if (command.logic && !isKnownLogic(command.logic)) {
            accept('warning', `Unknown logic '${command.logic}'.`, { node: command, property: 'logic' });
        }
        const script = command.$container;
        const index = script.commands.indexOf(command);
        const previous = script.commands.slice(0, index);
        if (previous.some(c => c.$type === 'SetLogic')) {
            accept('error', 'The logic has already been set.', { node: command });
        } else if (previous.some(c => !isStartModeCommand(c))) {
            accept('error', "'set-logic' must come before any declaration, definition or assertion.", { node: command });
        }
    }

    checkStackCommand(command: Push | Pop, accept: ValidationAcceptor): void {
        if (command.levels !== undefined && Number(command.levels) < 0) {
            accept('error', 'The number of levels must be a non-negative numeral.', { node: command, property: 'levels' });
        }
    }

    checkDeclareSort(command: DeclareSort, accept: ValidationAcceptor): void {
        if (command.arity !== undefined && Number(command.arity) < 0) {
            accept('error', 'The arity must be a non-negative numeral.', { node: command, property: 'arity' });
        }
    }

    checkDeclareDatatypes(command: DeclareDatatypes, accept: ValidationAcceptor): void {
        if (command.legacy) return;
        if (command.sorts.length !== command.datatypes.length) {
            accept('error', `${command.sorts.length} datatype sort(s) are declared, but ${command.datatypes.length} definition(s) are given.`, { node: command });
        }
        command.sorts.forEach((sortDec, i) => {
            const dt = command.datatypes[i];
            const arity = Number(sortDec.arity);
            if (dt && dt.parameters.length !== arity) {
                accept('error', arity === 0
                    ? `Datatype '${sortDec.name}' has arity 0 and must not use 'par'.`
                    : `Datatype '${sortDec.name}' has arity ${arity} and needs (par (...)) with ${arity} parameter(s).`, { node: dt });
            }
        });
    }

    checkDeclareDatatype(command: DeclareDatatype, accept: ValidationAcceptor): void {
        const names = new Set<string>();
        for (const ctor of command.datatype?.constructors ?? []) {
            if (names.has(ctor.name)) accept('error', `Duplicate constructor '${ctor.name}'.`, { node: ctor, property: 'name' });
            names.add(ctor.name);
        }
    }

    checkDefineFunsRec(command: DefineFunsRec, accept: ValidationAcceptor): void {
        if (command.declarations.length !== command.bodies.length) {
            accept('error', `${command.declarations.length} function(s) are declared, but ${command.bodies.length} bodies are given.`, { node: command });
        }
    }

    /******************************************************************************
     * Sorts and identifiers
     ******************************************************************************/

    checkSortArity(sort: SimpleSort | IndexedSort | ParametricSort, accept: ValidationAcceptor): void {
        if (this.isBuiltin(sort)) return;
        // A sort identifier that is the head of a parametric sort is checked with the parametric sort.
        if (!isParametricSort(sort) && isParametricSort(sort.$container) && sort.$container.identifier === sort) return;
        const identifier: SortIdentifier | undefined = isParametricSort(sort) ? sort.identifier : sort;
        const target = identifier?.symbol?.ref;
        if (!identifier || !target) return;
        const name = identifier.symbol.$refText;
        const argCount = isParametricSort(sort) ? sort.arguments.length : 0;
        const arity = this.sortChecker.sortArity(target);
        // Z3 legacy datatypes refer to themselves without arguments inside their declaration.
        const legacySelfReference = argCount === 0 && isLegacyDatatypeDec(target) && AstUtils.getContainerOfType(sort, isDeclareDatatypes) === target.$container;
        if (arity && !legacySelfReference && (argCount < arity.min || argCount > arity.max)) {
            const expected = arity.max === Infinity ? `at least ${arity.min}` : String(arity.min);
            accept('error', `Sort '${name}' expects ${expected} sort argument(s) but got ${argCount}.`, { node: sort });
        }
        const builtins = this.services.builtins.BuiltinLibrary;
        if (builtins.isBuiltinNode(target)) {
            const spec = builtins.getSortSpec(target.name);
            const expectedIndices = spec?.indices?.length ?? 0;
            const indices = isIndexedSort(identifier) ? identifier.indices : [];
            if (expectedIndices !== indices.length && !(spec?.alias && expectedIndices === 0 && indices.length === 0)) {
                accept('error', expectedIndices === 0
                    ? `Sort '${name}' is not indexed.`
                    : `Sort '${name}' expects ${expectedIndices} index(es), e.g. (_ ${name} ${spec!.indices!.map(() => 'n').join(' ')}).`, { node: identifier });
                return;
            }
            const values = indices.map(indexValue);
            if (target.name === 'BitVec' && typeof values[0] === 'number' && values[0] <= 0) {
                accept('error', 'The width of a bit-vector sort must be positive.', { node: identifier });
            }
            if (target.name === 'FloatingPoint' && values.length === 2 && values.some(v => typeof v === 'number' && v <= 1)) {
                accept('error', 'Exponent and significand sizes of a floating-point sort must be greater than 1.', { node: identifier });
            }
        } else if (isIndexedSort(identifier)) {
            accept('error', `Sort '${name}' is not indexed.`, { node: identifier });
        }
    }

    checkIndexedIdentifier(identifier: IndexedIdentifier, accept: ValidationAcceptor): void {
        if (this.isBuiltin(identifier)) return;
        const name = identifier.symbol?.$refText;
        if (name !== 'is' && name !== 'update-field') return;
        const index = identifier.indices[0];
        if (!index || !isSymbolIndex(index)) {
            accept('error', `'(_ ${name} ...)' expects the name of a ${name === 'is' ? 'constructor' : 'selector'}.`, { node: identifier, property: 'indices' });
            return;
        }
        const document = AstUtils.getDocument(identifier);
        const offset = identifier.$cstNode?.offset ?? 0;
        const target = this.scopeProvider.resolveGlobal(document, index.value, 'function', offset)?.node;
        const ok = name === 'is' ? isConstructorDec(target) : isSelectorDec(target);
        if (!ok) {
            accept('error', `'${index.value}' is not a datatype ${name === 'is' ? 'constructor' : 'selector'}.`, { node: index });
        }
    }

    checkNamedAttribute(attribute: NamedAttribute, accept: ValidationAcceptor): void {
        const annotated = attribute.$container;
        if (!isAnnotatedTerm(annotated) || !annotated.term) return;
        // Named terms must be closed: they must not contain variables bound outside of them.
        // Like Z3, `let` variables are allowed since let bindings are expanded.
        for (const node of AstUtils.streamAst(annotated.term)) {
            if (isSimpleIdentifier(node)) {
                const target = node.symbol?.ref;
                if (target && (isSortedVar(target) || isPatternVariable(target))
                    && !isWithin(target, annotated.term) && !isFunctionParameter(target)) {
                    accept('error', `Named term '${attribute.name}' contains the bound variable '${node.symbol.$refText}'; only closed terms can be named.`, { node: attribute, property: 'name' });
                    return;
                }
            }
        }
    }
}

function isWithin(node: AstNode, ancestor: AstNode): boolean {
    let current: AstNode | undefined = node;
    while (current) {
        if (current === ancestor) return true;
        current = current.$container;
    }
    return false;
}

function isFunctionParameter(node: AstNode): boolean {
    return isSortedVar(node) && (isFunctionDef(node.$container) || isFunctionDec(node.$container));
}

function isSortParameterLike(node: AstNode): boolean {
    return node.$type === 'SortParameter';
}

/** Commands allowed before `set-logic` (SMT-LIB start mode). */
function isStartModeCommand(command: Command): boolean {
    switch (command.$type) {
        case 'SetOption': case 'SetInfo': case 'GetInfo': case 'GetOption': case 'Echo': case 'GenericCommand':
            return true;
        case 'SimpleCommand':
            return command.name === 'reset' || command.name === 'exit';
        default:
            return false;
    }
}

function checkOptionValue(type: string, value: AttributeValue): string | undefined {
    switch (type) {
        case 'bool':
            return isSExprSymbol(value) && (value.value === 'true' || value.value === 'false') ? undefined : 'true or false';
        case 'uint':
        case 'numeral':
            return isSExprConstant(value) && /^\d+$/.test(value.value) ? undefined : 'a non-negative numeral';
        case 'double':
            return isSExprConstant(value) && /^-?\d+(\.\d*)?$/.test(value.value) ? undefined : 'a number';
        case 'string':
            return isSExprConstant(value) && value.value !== undefined && !/^-?[\d#]/.test(value.value) ? undefined
                : isSExprSymbol(value) ? undefined : 'a string';
        default:
            return undefined;
    }
}

/** Closest candidate by edit distance, if reasonably close. */
export function closest(name: string, candidates: string[]): string | undefined {
    let best: string | undefined;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
        const d = editDistance(name, candidate);
        if (d < bestDistance) {
            bestDistance = d;
            best = candidate;
        }
    }
    return best !== undefined && bestDistance <= Math.max(1, Math.floor(name.length / 3)) ? best : undefined;
}

function editDistance(a: string, b: string): number {
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = dp[j];
            dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return dp[b.length];
}

