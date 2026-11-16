import { ValidationAcceptor, ValidationChecks } from 'langium';
import {
    AssignConstraint,
    BinaryExpression,
    CaseBranch,
    CompassionExpression,
    CtlSpecification,
    Expression,
    FairnessExpression,
    InitBody,
    InitConstraint,
    InvarConstraint,
    InvarSpecification,
    JusticeExpression,
    LtlSpecification,
    NextBody,
    NuSMVAstType,
    PslSpecification,
    TransConstraint,
    UnaryExpression,
    VarBodyAssign,
    VariablePath
} from './generated/ast.js';
import { NuSMVServices } from './nusmv-module.js';
import { collectSymbolNames, findContainingModule } from './nusmv-symbols.js';
import {
    describeType,
    inferDeclaredType,
    inferExpressionType,
    isContextualEnumLiteral,
    isAssignable,
    isBooleanLike,
    isIntegerLike,
    resolvePathTargetModule,
    resolveSymbol
} from './nusmv-types.js';

export class NuSMVValidator {
    checkVariablePath(path: VariablePath, accept: ValidationAcceptor): void {
        const module = findContainingModule(path);
        if (!module) {
            return;
        }
        const symbols = new Set(collectSymbolNames(module));
        if (path.head !== 'running' && !symbols.has(normalizePathHead(path.head)) && !isContextualEnumLiteral(path)) {
            accept('error', `Unknown symbol '${path.head}'.`, { node: path, property: 'head' });
            return;
        }
        for (const [index, segment] of path.segments.entries()) {
            if (segment.$type === 'DotSegment') {
                const targetModule = resolvePathTargetModule(path, index);
                const segmentSymbols = targetModule ? new Set(collectSymbolNames(targetModule)) : undefined;
                if (!segmentSymbols?.has(segment.symbol)) {
                    accept('error', `Unknown symbol '${segment.symbol}'.`, { node: segment, property: 'symbol' });
                }
            }
        }
    }

    checkFairnessRunning(node: FairnessExpression, accept: ValidationAcceptor): void {
        if (isRunningReference(node.expression)) {
            return;
        }
        this.checkBooleanConstraint(node, accept);
    }

    checkJusticeRunning(node: JusticeExpression, accept: ValidationAcceptor): void {
        if (isRunningReference(node.expression)) {
            return;
        }
        this.checkBooleanConstraint(node, accept);
    }

    checkCompassionRunning(node: CompassionExpression, accept: ValidationAcceptor): void {
        const firstIsRunning = isRunningReference(node.first);
        const secondIsRunning = isRunningReference(node.second);
        if (!firstIsRunning) {
            const firstType = inferExpressionType(node.first);
            if (!isBooleanLike(firstType)) {
                accept('error', `Constraint expression must be boolean, found ${describeType(firstType)}.`, { node, property: 'first' });
            }
        }
        if (!secondIsRunning) {
            const secondType = inferExpressionType(node.second);
            if (!isBooleanLike(secondType)) {
                accept('error', `Constraint expression must be boolean, found ${describeType(secondType)}.`, { node, property: 'second' });
            }
        }
    }

    checkCaseBranch(branch: CaseBranch, accept: ValidationAcceptor): void {
        const conditionType = inferExpressionType(branch.condition);
        if (!isBooleanLike(conditionType)) {
            accept('error', `Case condition must be boolean, found ${describeType(conditionType)}.`, { node: branch, property: 'condition' });
        }
    }

    checkBinaryExpression(expression: BinaryExpression, accept: ValidationAcceptor): void {
        const left = inferExpressionType(expression.left);
        const right = inferExpressionType(expression.right);

        switch (expression.operator) {
            case '&':
            case '|':
            case 'xor':
            case 'xnor':
            case '->':
            case '<->':
            case 'U':
            case 'V':
            case 'S':
            case 'T':
                this.requireBooleanOperands(expression, left, right, accept);
                return;
            case '+':
            case '-':
            case '*':
            case '/':
            case 'mod':
                this.requireIntegerOperands(expression, left, right, accept);
                return;
            case '<':
            case '<=':
            case '>':
            case '>=':
                this.requireIntegerOperands(expression, left, right, accept);
                return;
            case '=':
            case '!=':
                if (!isAssignable(left, right) || !isAssignable(right, left)) {
                    accept(
                        'error',
                        `Operator '${expression.operator}' cannot compare ${describeType(left)} with ${describeType(right)}.`,
                        { node: expression, property: 'operator' }
                    );
                }
                return;
            case 'in':
                if (right.kind !== 'set' && right.kind !== 'unknown') {
                    accept('error', `Right-hand side of 'in' must be a set, found ${describeType(right)}.`, {
                        node: expression,
                        property: 'operator'
                    });
                }
                return;
            default:
                return;
        }
    }

    checkUnaryExpression(expression: UnaryExpression, accept: ValidationAcceptor): void {
        const operandType = inferExpressionType(expression.operand);
        switch (expression.operator) {
            case '!':
            case 'AF':
            case 'AG':
            case 'AX':
            case 'EF':
            case 'EG':
            case 'EX':
            case 'F':
            case 'G':
            case 'H':
            case 'O':
            case 'X':
            case 'Y':
            case 'Z':
                if (!isBooleanLike(operandType)) {
                    accept('error', `Operator '${expression.operator}' requires a boolean operand, found ${describeType(operandType)}.`, {
                        node: expression,
                        property: 'operator'
                    });
                }
                return;
            case '+':
            case '-':
                if (!isIntegerLike(operandType)) {
                    accept('error', `Operator '${expression.operator}' requires an integer operand, found ${describeType(operandType)}.`, {
                        node: expression,
                        property: 'operator'
                    });
                }
                return;
            default:
                return;
        }
    }

    checkInitBody(body: InitBody, accept: ValidationAcceptor): void {
        this.checkAssignmentLike(body.var, body.initial, 'initial assignment', accept);
    }

    checkNextBody(body: NextBody, accept: ValidationAcceptor): void {
        this.checkAssignmentLike(body.var, body.next, 'next assignment', accept);
    }

    checkVarBodyAssign(body: VarBodyAssign, accept: ValidationAcceptor): void {
        this.checkAssignmentLike(body.var, body.assignment, 'assignment', accept);
    }

    checkBooleanConstraint(node: InitConstraint | InvarConstraint | TransConstraint | FairnessExpression | JusticeExpression, accept: ValidationAcceptor): void {
        const type = inferExpressionType(node.expression);
        if (!isBooleanLike(type)) {
            accept('error', `Constraint expression must be boolean, found ${describeType(type)}.`, { node, property: 'expression' });
        }
    }

    checkSpecification(node: CtlSpecification | InvarSpecification | LtlSpecification | PslSpecification, accept: ValidationAcceptor): void {
        const type = inferExpressionType(node.expression);
        if (!isBooleanLike(type)) {
            accept('error', `Specification expression must be boolean, found ${describeType(type)}.`, { node, property: 'expression' });
        }
    }

    private checkAssignmentLike(path: VariablePath, expression: Expression, label: string, accept: ValidationAcceptor): void {
        if (!path || !expression) {
            return;
        }
        const symbol = resolveSymbol(path);
        if (!symbol || !('type' in symbol)) {
            return;
        }
        const targetType = inferDeclaredType(symbol.type);
        const valueType = inferExpressionType(expression);
        if (!isAssignable(targetType, valueType)) {
            accept('error', `Invalid ${label}: cannot assign ${describeType(valueType)} to ${describeType(targetType)}.`, {
                node: expression
            });
        }
    }

    private requireBooleanOperands(expression: BinaryExpression, left: ReturnType<typeof inferExpressionType>, right: ReturnType<typeof inferExpressionType>, accept: ValidationAcceptor): void {
        if (!isBooleanLike(left) || !isBooleanLike(right)) {
            accept('error', `Operator '${expression.operator}' requires boolean operands, found ${describeType(left)} and ${describeType(right)}.`, {
                node: expression,
                property: 'operator'
            });
        }
    }

    private requireIntegerOperands(expression: BinaryExpression, left: ReturnType<typeof inferExpressionType>, right: ReturnType<typeof inferExpressionType>, accept: ValidationAcceptor): void {
        if (!isIntegerLike(left) || !isIntegerLike(right)) {
            accept('error', `Operator '${expression.operator}' requires integer operands, found ${describeType(left)} and ${describeType(right)}.`, {
                node: expression,
                property: 'operator'
            });
        }
    }
}

export function registerValidationChecks(services: NuSMVServices): void {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.NuSMVValidator;
    const checks: ValidationChecks<NuSMVAstType> = {
        VariablePath: validator.checkVariablePath,
        CaseBranch: validator.checkCaseBranch,
        BinaryExpression: validator.checkBinaryExpression,
        UnaryExpression: validator.checkUnaryExpression,
        InitBody: validator.checkInitBody,
        NextBody: validator.checkNextBody,
        VarBodyAssign: validator.checkVarBodyAssign,
        InitConstraint: validator.checkBooleanConstraint,
        InvarConstraint: validator.checkBooleanConstraint,
        TransConstraint: validator.checkBooleanConstraint,
        JusticeExpression: validator.checkJusticeRunning,
        FairnessExpression: validator.checkFairnessRunning,
        CompassionExpression: validator.checkCompassionRunning,
        CtlSpecification: validator.checkSpecification,
        InvarSpecification: validator.checkSpecification,
        LtlSpecification: validator.checkSpecification,
        PslSpecification: validator.checkSpecification
    };
    registry.register(checks, validator);
}

function normalizePathHead(head: string): string {
    return head.endsWith('.') ? head.slice(0, -1) : head;
}

function isRunningReference(node: unknown): node is { path: { head: string } } {
    return typeof node === 'object'
        && node !== null
        && '$type' in node
        && (node as { $type?: string }).$type === 'ReferenceExpression'
        && 'path' in node
        && typeof (node as { path?: { head?: string } }).path?.head === 'string'
        && (node as { path: { head: string } }).path.head === 'running';
}
