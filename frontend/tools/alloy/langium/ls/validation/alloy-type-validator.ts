import { DiagnosticTag } from 'vscode-languageserver';
import { AstUtils, type AstNode, type ValidationAcceptor } from 'langium';
import {
    isAssertDecl, isAtExpr, isFunDecl, isLetExpr, isModuleParam, isPredDecl, isQualName, isQuantExpr,
    type AlloyModule, type CmdDecl, type TypeScope
} from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';
import type { AlloyTypeChecker } from '../typing/type-checker.js';
import { isBuiltinReference, isSigNode, qualifiedText } from '../typing/sig-model.js';

/**
 * Semantic checks of the Alloy Analyzer: type errors and warnings, command targets and
 * scopes, and unused variables. Messages follow Alloy's wording.
 */
export class AlloyTypeValidator {

    protected readonly typeChecker: AlloyTypeChecker;

    constructor(services: AlloyServices) {
        this.typeChecker = services.typing.TypeChecker;
    }

    /** Type errors and warnings of the whole module. */
    checkTypes(module: AlloyModule, accept: ValidationAcceptor): void {
        const analysis = this.typeChecker.analyze(AstUtils.getDocument(module));
        for (const problem of analysis.problems) {
            accept(problem.severity, problem.message, { node: problem.node, property: problem.property, index: problem.index });
        }
    }

    /** Quantified and let-bound variables that are never used (Alloy warns about these). */
    checkUnusedVariables(module: AlloyModule, accept: ValidationAcceptor): void {
        const used = new Set<AstNode>();
        for (const node of AstUtils.streamAst(module)) {
            if (isQualName(node) || isAtExpr(node)) {
                const target = node.ref.ref;
                if (target) used.add(target);
            }
        }
        for (const node of AstUtils.streamAst(module)) {
            const variables = isQuantExpr(node) ? node.decls.flatMap(d => d.names) : isLetExpr(node) ? node.decls : [];
            for (const variable of variables) {
                if (!used.has(variable)) {
                    accept('warning', 'This variable is unused.', { node: variable, property: 'name', tags: [DiagnosticTag.Unnecessary] });
                }
            }
        }
    }

    /** "run" needs a predicate or function, "check" an assertion. */
    checkCommand(cmd: CmdDecl, accept: ValidationAcceptor): void {
        const target = cmd.predicate?.ref.ref;
        if (cmd.predicate && target) {
            const name = qualifiedText(cmd.predicate);
            if (cmd.kind === 'check' && !isAssertDecl(target)) {
                accept('error', `The assertion "${name}" cannot be found.`, { node: cmd, property: 'predicate' });
            } else if (cmd.kind === 'run' && !isPredDecl(target) && !isFunDecl(target)) {
                accept('error', `The predicate/function "${name}" cannot be found.`, { node: cmd, property: 'predicate' });
            }
        }
    }

    /** Scopes can only be given for sigs, Int, seq, String and steps, as in Alloy.cup. */
    checkTypeScope(scope: TypeScope, accept: ValidationAcceptor): void {
        const growing = scope.range && (scope.endNumber === undefined || scope.endNumber > scope.number) || scope.stepNumber !== undefined;
        if (scope.seq || (scope.type && isBuiltinReference(scope.type) && ['Int', 'int'].includes(qualifiedText(scope.type)))) {
            const what = scope.seq ? 'seq' : 'Int';
            if (growing) {
                accept('error', `Cannot specify a growing scope for "${what}"`, { node: scope });
            } else if (scope.exactly) {
                const reason = scope.seq ? 'the number of sequence index has to be exact' : 'the integer bitwidth must be exact';
                accept('error', `The exactly keyword is redundant here since ${reason}.`, { node: scope, property: 'exactly' });
            }
            return;
        }
        if (!scope.type) return;
        const name = qualifiedText(scope.type);
        const target = scope.type.ref.ref;
        if (isBuiltinReference(scope.type)) {
            if (name === 'univ' || name === 'none') {
                accept('error', `You cannot set a scope on ${name}.`, { node: scope, property: 'type' });
            }
        } else if (target && !isSigNode(target) && !isModuleParam(target)) {
            accept('error', `The sig "${name}" cannot be found.`, { node: scope, property: 'type' });
        }
    }
}
