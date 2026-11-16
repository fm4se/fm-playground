import { AstUtils } from 'langium';
import {
    ArrayType,
    AsyncProcessType,
    BinaryExpression,
    BooleanType,
    CaseExpression,
    DefineBody,
    DotSegment,
    EnumType,
    EnumValue,
    Expression,
    FormalParameter,
    FunctionCallExpression,
    GroupedExpression,
    IntervalLiteral,
    IntervalType,
    isArrayType,
    isAsyncProcessType,
    isBinaryExpression,
    isBooleanType,
    isCaseBranch,
    isCaseExpression,
    isDefineBody,
    isEnumType,
    isEnumValue,
    isFormalParameter,
    isFunctionCallExpression,
    isGroupedExpression,
    isInitBody,
    isIntervalLiteral,
    isIntervalType,
    isLiteralExpression,
    isModule,
    isNextBody,
    isNextCallExpression,
    isReferenceExpression,
    isSetExpression,
    isSignedWordType,
    isSyncProcessType,
    isUnaryExpression,
    isUnsignedWordType,
    isUntilCtlExpression,
    isVarBodyAssign,
    isVarBody,
    isWordLiteral,
    isWordType,
    InitBody,
    LiteralExpression,
    Module,
    NextBody,
    NextCallExpression,
    ReferenceExpression,
    SetExpression,
    SignedWordType,
    Type,
    UnaryExpression,
    UnsignedWordType,
    UntilCtlExpression,
    VarBody,
    VarBodyAssign,
    VariablePath,
    WordLiteral,
    WordType
} from './generated/ast.js';
import { collectModuleSymbols, NuSMVSymbol } from './nusmv-symbols.js';

export type SemanticType =
    | { kind: 'boolean' }
    | { kind: 'integer' }
    | { kind: 'enum'; values?: Set<string> }
    | { kind: 'word' }
    | { kind: 'array' }
    | { kind: 'module' }
    | { kind: 'set'; element: SemanticType }
    | { kind: 'unknown' };

const BOOLEAN_TYPE: SemanticType = { kind: 'boolean' };
const INTEGER_TYPE: SemanticType = { kind: 'integer' };
const WORD_TYPE: SemanticType = { kind: 'word' };
const ARRAY_TYPE: SemanticType = { kind: 'array' };
const MODULE_TYPE: SemanticType = { kind: 'module' };
const UNKNOWN_TYPE: SemanticType = { kind: 'unknown' };

export function describeType(type: SemanticType): string {
    switch (type.kind) {
        case 'boolean':
        case 'integer':
        case 'word':
        case 'array':
        case 'module':
        case 'unknown':
            return type.kind;
        case 'enum':
            return 'enumeration';
        case 'set':
            return `${describeType(type.element)} set`;
    }
}

export function inferDeclaredType(type: Type | undefined): SemanticType {
    if (!type) {
        return UNKNOWN_TYPE;
    }
    if (isBooleanType(type)) {
        return BOOLEAN_TYPE;
    }
    if (isIntervalType(type)) {
        return INTEGER_TYPE;
    }
    if (isEnumType(type)) {
        return { kind: 'enum', values: new Set(type.values.map(value => value.name)) };
    }
    if (isWordType(type) || isSignedWordType(type) || isUnsignedWordType(type)) {
        return WORD_TYPE;
    }
    if (isArrayType(type)) {
        return ARRAY_TYPE;
    }
    if (isSyncProcessType(type)) {
        return MODULE_TYPE;
    }
    return UNKNOWN_TYPE;
}

export function resolveSymbol(path: VariablePath): NuSMVSymbol | undefined {
    return resolvePathState(path, new Set()).symbol;
}

export function resolvePathSymbol(path: VariablePath, segmentCount: number = path.segments.length): NuSMVSymbol | undefined {
    return resolvePathState(path, new Set(), segmentCount).symbol;
}

export function resolveContextualEnumLiteral(path: VariablePath, seenDefines: Set<string> = new Set()): EnumValue | undefined {
    if (path.segments.length > 0) {
        return undefined;
    }
    const literal = normalizePathHead(path.head);
    for (const enumType of collectExpectedEnumDeclarations(path, seenDefines)) {
        const value = enumType.values.find(candidate => candidate.name === literal);
        if (value) {
            return value;
        }
    }
    return undefined;
}

export function resolvePathTargetModule(path: VariablePath, segmentCount: number = path.segments.length): Module | undefined {
    const state = resolvePathState(path, new Set(), segmentCount);
    return state.astType ? moduleFromType(state.astType) : undefined;
}

export function inferVariablePathType(path: VariablePath, seenDefines: Set<string> = new Set()): SemanticType {
    return resolvePathState(path, seenDefines).semantic;
}

export function isContextualEnumLiteral(path: VariablePath, seenDefines: Set<string> = new Set()): boolean {
    return resolveContextualEnumLiteral(path, seenDefines) !== undefined;
}

export function inferExpressionType(
    expression: Expression | CaseExpression | GroupedExpression | NextCallExpression | SetExpression | UntilCtlExpression | FunctionCallExpression | ReferenceExpression | LiteralExpression | IntervalLiteral | WordLiteral,
    seenDefines: Set<string> = new Set()
): SemanticType {
    if (isBinaryExpression(expression)) {
        return inferBinaryExpressionType(expression, seenDefines);
    }
    if (isUnaryExpression(expression)) {
        return inferUnaryExpressionType(expression, seenDefines);
    }
    if (isGroupedExpression(expression)) {
        return inferExpressionType(expression.expression, seenDefines);
    }
    if (isNextCallExpression(expression)) {
        return inferExpressionType(expression.expression, seenDefines);
    }
    if (isCaseExpression(expression)) {
        return inferCaseExpressionType(expression, seenDefines);
    }
    if (isSetExpression(expression)) {
        return inferSetExpressionType(expression, seenDefines);
    }
    if (isIntervalLiteral(expression)) {
        return INTEGER_TYPE;
    }
    if (isUntilCtlExpression(expression)) {
        return BOOLEAN_TYPE;
    }
    if (isFunctionCallExpression(expression)) {
        switch (expression.function) {
            case 'bool':
                return BOOLEAN_TYPE;
            case 'toint':
                return INTEGER_TYPE;
            case 'word1':
                return WORD_TYPE;
        }
    }
    if (isReferenceExpression(expression)) {
        return inferReferenceType(expression, seenDefines);
    }
    if (isLiteralExpression(expression)) {
        return inferLiteralType(expression);
    }
    if (isWordLiteral(expression)) {
        return WORD_TYPE;
    }
    return UNKNOWN_TYPE;
}

export function isAssignable(target: SemanticType, value: SemanticType): boolean {
    if (target.kind === 'unknown' || value.kind === 'unknown') {
        return true;
    }
    if (target.kind === value.kind) {
        if (target.kind === 'enum' && value.kind === 'enum') {
            return enumCompatible(target, value);
        }
        if (target.kind === 'set' && value.kind === 'set') {
            return isAssignable(target.element, value.element);
        }
        return true;
    }
    if (target.kind === 'enum' && value.kind === 'enum') {
        return enumCompatible(target, value);
    }
    return false;
}

export function isBooleanLike(type: SemanticType): boolean {
    return type.kind === 'boolean' || type.kind === 'unknown';
}

export function isIntegerLike(type: SemanticType): boolean {
    return type.kind === 'integer' || type.kind === 'unknown';
}

function findContainingModule(node: object): Module | undefined {
    return AstUtils.getContainerOfType(node as never, isModule);
}

function inferBinaryExpressionType(expression: BinaryExpression, seenDefines: Set<string>): SemanticType {
    const left = inferExpressionType(expression.left, seenDefines);
    const right = inferExpressionType(expression.right, seenDefines);

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
        case 'in':
            return BOOLEAN_TYPE;
        case '=':
        case '!=':
        case '<':
        case '<=':
        case '>':
        case '>=':
            return BOOLEAN_TYPE;
        case '+':
        case '-':
        case '*':
        case '/':
        case 'mod':
        case '>>':
        case '<<':
            return left.kind === 'word' || right.kind === 'word' ? WORD_TYPE : INTEGER_TYPE;
        case 'union':
        case '::':
            return inferCollectionResult(left, right);
        default:
            return UNKNOWN_TYPE;
    }
}

function inferUnaryExpressionType(expression: UnaryExpression, seenDefines: Set<string>): SemanticType {
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
            return BOOLEAN_TYPE;
        case '+':
        case '-':
            return INTEGER_TYPE;
        default:
            return inferExpressionType(expression.operand, seenDefines);
    }
}

function inferCaseExpressionType(expression: CaseExpression, seenDefines: Set<string>): SemanticType {
    let result: SemanticType | undefined;
    for (const branch of expression.branches) {
        const valueType = inferExpressionType(branch.value, seenDefines);
        if (!result) {
            result = valueType;
        } else if (!isAssignable(result, valueType) || !isAssignable(valueType, result)) {
            return UNKNOWN_TYPE;
        }
    }
    return result ?? UNKNOWN_TYPE;
}

function inferSetExpressionType(expression: SetExpression, seenDefines: Set<string>): SemanticType {
    if (expression.elements.length === 0) {
        return { kind: 'set', element: UNKNOWN_TYPE };
    }
    let elementType = inferExpressionType(expression.elements[0], seenDefines);
    for (const element of expression.elements.slice(1)) {
        const current = inferExpressionType(element, seenDefines);
        if (!isAssignable(elementType, current) || !isAssignable(current, elementType)) {
            elementType = UNKNOWN_TYPE;
            break;
        }
    }
    return { kind: 'set', element: elementType };
}

function inferReferenceType(expression: ReferenceExpression, seenDefines: Set<string>): SemanticType {
    const type = inferVariablePathType(expression.path, seenDefines);
    return type.kind === 'unknown'
        ? inferContextualEnumLiteralType(expression.path, seenDefines) ?? type
        : type;
}

function inferLiteralType(expression: LiteralExpression): SemanticType {
    if (expression.number !== undefined) {
        return INTEGER_TYPE;
    }
    if (expression.value === 'TRUE' || expression.value === 'FALSE') {
        return BOOLEAN_TYPE;
    }
    return UNKNOWN_TYPE;
}

function inferSymbolType(symbol: NuSMVSymbol, seenDefines: Set<string>): SemanticType {
    if (isVarBody(symbol)) {
        return inferDeclaredType(symbol.type);
    }
    if (isEnumValue(symbol)) {
        return {
            kind: 'enum',
            values: new Set(symbol.$container.values.map(value => value.name))
        };
    }
    if (isDefineBody(symbol)) {
        if (seenDefines.has(symbol.name)) {
            return UNKNOWN_TYPE;
        }
        const nextSeen = new Set(seenDefines);
        nextSeen.add(symbol.name);
        return inferExpressionType(symbol.assignment, nextSeen);
    }
    if (isFormalParameter(symbol)) {
        return UNKNOWN_TYPE;
    }
    return UNKNOWN_TYPE;
}

function resolvePathState(path: VariablePath, seenDefines: Set<string>, segmentCount: number = path.segments.length): PathState {
    const module = findContainingModule(path);
    if (!module) {
        return { semantic: UNKNOWN_TYPE };
    }

    const headName = normalizePathHead(path.head);
    let current = headName === 'running'
        ? { semantic: BOOLEAN_TYPE }
        : symbolToState(collectModuleSymbols(module).find(symbol => symbol.name === headName), seenDefines);
    for (const segment of path.segments.slice(0, segmentCount)) {
        current = resolveSegmentState(current, segment, seenDefines);
        if (!current.symbol && current.semantic.kind === 'unknown' && !current.astType) {
            break;
        }
    }
    return current;
}

function normalizePathHead(head: string): string {
    return head.endsWith('.') ? head.slice(0, -1) : head;
}

function inferContextualEnumLiteralType(path: VariablePath, seenDefines: Set<string>): SemanticType | undefined {
    if (path.segments.length > 0) {
        return undefined;
    }
    const literal = normalizePathHead(path.head);
    const expectedTypes = collectExpectedEnumTypes(path, seenDefines);
    return expectedTypes.find(type => type.values?.has(literal));
}

function collectExpectedEnumTypes(path: VariablePath, seenDefines: Set<string>): Array<Extract<SemanticType, { kind: 'enum' }>> {
    return collectExpectedEnumDeclarations(path, seenDefines)
        .map(type => inferDeclaredType(type))
        .filter((type): type is Extract<SemanticType, { kind: 'enum' }> => type.kind === 'enum');
}

function collectExpectedEnumDeclarations(path: VariablePath, seenDefines: Set<string>): EnumType[] {
    const declarations: EnumType[] = [];
    const reference = AstUtils.getContainerOfType(path, isReferenceExpression);
    if (!reference) {
        return declarations;
    }

    const binary = AstUtils.getContainerOfType(reference, isBinaryExpression);
    if (binary && (binary.operator === '=' || binary.operator === '!=')) {
        const opposite = expressionOnOtherSide(binary, reference);
        if (opposite) {
            const oppositeEnum = inferNonContextualEnumDeclaration(opposite, seenDefines);
            if (oppositeEnum) {
                declarations.push(oppositeEnum);
            }
        }
    }

    const assignment = AstUtils.getContainerOfType(reference, isAssignmentLikeContainer);
    const valueExpression = assignment ? assignmentValueExpression(assignment) : undefined;
    if (assignment && valueExpression && isAssignmentValueContext(reference, valueExpression)) {
        const symbol = resolveSymbol(assignment.var);
        if (symbol && isVarBody(symbol)) {
            if (isEnumType(symbol.type)) {
                declarations.push(symbol.type);
            }
        }
    }

    return declarations;
}

function inferNonContextualEnumDeclaration(expression: unknown, seenDefines: Set<string>): EnumType | undefined {
    if (isGroupedExpression(expression)) {
        return inferNonContextualEnumDeclaration(expression.expression, seenDefines);
    }
    if (isNextCallExpression(expression)) {
        return inferNonContextualEnumDeclaration(expression.expression, seenDefines);
    }
    if (isReferenceExpression(expression)) {
        return enumDeclarationForSymbol(resolvePathSymbol(expression.path));
    }
    if (isDefineBody(expression)) {
        if (seenDefines.has(expression.name)) {
            return undefined;
        }
        const nextSeen = new Set(seenDefines);
        nextSeen.add(expression.name);
        return inferNonContextualEnumDeclaration(expression.assignment, nextSeen);
    }
    return undefined;
}

function enumDeclarationForSymbol(symbol: NuSMVSymbol | undefined): EnumType | undefined {
    if (isVarBody(symbol) && isEnumType(symbol.type)) {
        return symbol.type;
    }
    if (isEnumValue(symbol)) {
        return symbol.$container;
    }
    return undefined;
}

function inferNonContextualExpressionType(expression: unknown, seenDefines: Set<string>): SemanticType {
    if (isGroupedExpression(expression)) {
        return inferNonContextualExpressionType(expression.expression, seenDefines);
    }
    if (isNextCallExpression(expression)) {
        return inferNonContextualExpressionType(expression.expression, seenDefines);
    }
    if (isReferenceExpression(expression)) {
        return inferVariablePathType(expression.path, seenDefines);
    }
    if (isLiteralExpression(expression)) {
        return inferLiteralType(expression);
    }
    if (isIntervalLiteral(expression)) {
        return INTEGER_TYPE;
    }
    if (isWordLiteral(expression)) {
        return WORD_TYPE;
    }
    if (isFunctionCallExpression(expression)) {
        switch (expression.function) {
            case 'bool':
                return BOOLEAN_TYPE;
            case 'toint':
                return INTEGER_TYPE;
            case 'word1':
                return WORD_TYPE;
        }
    }
    return UNKNOWN_TYPE;
}

function expressionOnOtherSide(binary: BinaryExpression, reference: ReferenceExpression): Expression | undefined {
    if (isDescendantOf(reference, binary.left)) {
        return binary.right;
    }
    if (isDescendantOf(reference, binary.right)) {
        return binary.left;
    }
    return undefined;
}

function assignmentValueExpression(assignment: InitBody | NextBody | VarBodyAssign): Expression {
    if (isInitBody(assignment)) {
        return assignment.initial;
    }
    if (isNextBody(assignment)) {
        return assignment.next;
    }
    return assignment.assignment;
}

function isAssignmentValueContext(reference: ReferenceExpression, valueExpression: Expression): boolean {
    if (!isDescendantOf(reference, valueExpression)) {
        return false;
    }
    let current: unknown = reference;
    while (typeof current === 'object' && current !== null && current !== valueExpression) {
        const parent = (current as { $container?: unknown }).$container;
        if (isGroupedExpression(parent) || isNextCallExpression(parent)) {
            if (parent.expression !== current) {
                return false;
            }
            current = parent;
            continue;
        }
        if (isCaseBranch(parent)) {
            if (isDescendantOf(current, parent.condition) || !isDescendantOf(current, parent.value)) {
                return false;
            }
            current = parent.$container;
            continue;
        }
        return false;
    }
    return current === valueExpression;
}

function isAssignmentLikeContainer(node: object): node is InitBody | NextBody | VarBodyAssign {
    return isInitBody(node) || isNextBody(node) || isVarBodyAssign(node);
}

function isDescendantOf(node: object, ancestor: object): boolean {
    let current: unknown = node;
    while (typeof current === 'object' && current !== null) {
        if (current === ancestor) {
            return true;
        }
        current = (current as { $container?: unknown }).$container;
    }
    return false;
}

function resolveSegmentState(current: PathState, segment: VariablePath['segments'][number], seenDefines: Set<string>): PathState {
    switch (segment.$type) {
        case 'DotSegment':
            if (!current.astType) {
                return { semantic: UNKNOWN_TYPE };
            }
            return symbolToState(resolveTypeMember(current.astType, segment.symbol), seenDefines);
        case 'IndexSegment':
            if (current.astType && isArrayType(current.astType)) {
                return typeToState(current.astType.type, current.symbol);
            }
            return { semantic: UNKNOWN_TYPE };
        case 'SliceSegment':
            if (current.astType && (isWordType(current.astType) || isSignedWordType(current.astType) || isUnsignedWordType(current.astType))) {
                return { symbol: current.symbol, astType: current.astType, semantic: WORD_TYPE };
            }
            return { semantic: UNKNOWN_TYPE };
        default:
            return { semantic: UNKNOWN_TYPE };
    }
}

function resolveTypeMember(type: Type | undefined, member: string): NuSMVSymbol | undefined {
    const targetModule = moduleFromType(type);
    if (!targetModule) {
        return undefined;
    }
    return collectModuleSymbols(targetModule).find(symbol => symbol.name === member);
}

function moduleFromType(type: Type | undefined): Module | undefined {
    if (isSyncProcessType(type) || isAsyncProcessType(type)) {
        return type.module?.ref;
    }
    return undefined;
}

function symbolToState(symbol: NuSMVSymbol | undefined, seenDefines: Set<string>): PathState {
    if (!symbol) {
        return { semantic: UNKNOWN_TYPE };
    }
    if (isVarBody(symbol)) {
        return typeToState(symbol.type, symbol);
    }
    if (isEnumValue(symbol)) {
        return {
            symbol,
            semantic: {
                kind: 'enum',
                values: new Set(symbol.$container.values.map(value => value.name))
            }
        };
    }
    if (isDefineBody(symbol)) {
        return { symbol, semantic: inferSymbolType(symbol, seenDefines) };
    }
    if (isFormalParameter(symbol)) {
        return { symbol, semantic: UNKNOWN_TYPE };
    }
    return { symbol, semantic: UNKNOWN_TYPE };
}

function typeToState(type: Type | undefined, symbol?: NuSMVSymbol): PathState {
    if (!type) {
        return { symbol, semantic: UNKNOWN_TYPE };
    }
    return {
        symbol,
        astType: type,
        semantic: inferDeclaredType(type)
    };
}

function enumCompatible(left: Extract<SemanticType, { kind: 'enum' }>, right: Extract<SemanticType, { kind: 'enum' }>): boolean {
    if (!left.values || !right.values) {
        return true;
    }
    for (const value of right.values) {
        if (left.values.has(value)) {
            return true;
        }
    }
    return false;
}

function inferCollectionResult(left: SemanticType, right: SemanticType): SemanticType {
    if (left.kind === 'set' && right.kind === 'set') {
        return { kind: 'set', element: isAssignable(left.element, right.element) ? left.element : UNKNOWN_TYPE };
    }
    if (left.kind === 'set') {
        return left;
    }
    if (right.kind === 'set') {
        return right;
    }
    return UNKNOWN_TYPE;
}

type PathState = {
    symbol?: NuSMVSymbol
    astType?: Type
    semantic: SemanticType
};
