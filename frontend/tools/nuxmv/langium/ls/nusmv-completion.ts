import { AstUtils, CstUtils, type AstNode, type ReferenceInfo } from 'langium';
import { DefaultCompletionProvider } from 'langium/lsp';
import type { CompletionParams } from 'vscode-languageserver';
import { CompletionItemKind, CompletionList } from 'vscode-languageserver';
import type { CancellationToken } from 'vscode-languageserver/node.js';
import {
    AsyncProcessType,
    CaseBranch,
    CompassionExpression,
    ComputeSpecification,
    ConstantSymbol,
    CtlSpecification,
    DefineBody,
    DotSegment,
    EnumValue,
    FairnessExpression,
    FormalParameter,
    InitBody,
    InitConstraint,
    InvarConstraint,
    InvarSpecification,
    JusticeExpression,
    LtlSpecification,
    Module,
    NextBody,
    PslSpecification,
    SyncProcessType,
    TransConstraint,
    VarBody,
    VarBodyAssign,
    VariablePath,
    isAsyncProcessType,
    isCaseBranch,
    isCompassionExpression,
    isComputeSpecification,
    isConstantSymbol,
    isCtlSpecification,
    isDefineBody,
    isDotSegment,
    isEnumType,
    isEnumValue,
    isFairnessExpression,
    isFormalParameter,
    isInitBody,
    isInitConstraint,
    isInvarConstraint,
    isInvarSpecification,
    isJusticeExpression,
    isLtlSpecification,
    isModule,
    isNextBody,
    isPslSpecification,
    isSyncProcessType,
    isTransConstraint,
    isVarBody,
    isVarBodyAssign,
    isVariablePath
} from './generated/ast.js';
import { NuSMVServices } from './nusmv-module.js';
import { collectDeclaredModules, collectVisibleModuleSymbols, findContainingModule, type NuSMVSymbol } from './nusmv-symbols.js';
import { resolvePathTargetModule, resolveSymbol } from './nusmv-types.js';

const BUILTIN_LITERAL_ITEMS = [
    createLiteralItem('TRUE'),
    createLiteralItem('FALSE'),
    createLiteralItem('self')
];

const IDENTIFIER_TRIGGER_CHARACTERS = [
    '_',
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
];

export class NuSMVCompletionProvider extends DefaultCompletionProvider {

    override readonly completionOptions = {
        triggerCharacters: ['.', ...IDENTIFIER_TRIGGER_CHARACTERS]
    };

    constructor(services: NuSMVServices) {
        super(services);
    }

    protected override getReferenceCandidates(refInfo: ReferenceInfo, context: Parameters<DefaultCompletionProvider['getReferenceCandidates']>[1]) {
        const candidates = super.getReferenceCandidates(refInfo, context);
        const referenceType = this.astReflection.getReferenceType(refInfo);
        return referenceType === 'Module'
            ? candidates.filter(description => description.type === Module.$type)
            : candidates;
    }

    override async getCompletion(document, params: CompletionParams, cancelToken?: CancellationToken) {
        const dotItems = this.getDotAccessCompletionItems(document, params);
        if (dotItems) {
            return CompletionList.create(this.deduplicateItems(dotItems), false);
        }

        const completion = await super.getCompletion(document, params, cancelToken);
        const items = completion?.items ?? [];
        const additionalItems = this.getSmartCompletionItems(document, params);
        if (items.length === 0 && additionalItems.length === 0) {
            return completion;
        }
        return CompletionList.create(this.deduplicateItems([...items, ...additionalItems]), completion?.isIncomplete ?? true);
    }

    private getSmartCompletionItems(document, params: CompletionParams) {
        const root = document.parseResult.value;
        const cstRoot = root.$cstNode;
        if (!cstRoot) {
            return [];
        }

        const text = document.textDocument.getText();
        const offset = document.textDocument.offsetAt(params.position);
        const currentNode = this.findAstNodeNearOffset(cstRoot, text, offset, 1)
            ?? this.findAstNodeNearOffset(cstRoot, text, offset, -1);
        const previousNode = offset > 0 ? this.findAstNodeNearOffset(cstRoot, text, offset - 1, -1) : undefined;
        const targetNode = currentNode ?? previousNode ?? root;
        const module = findContainingModule(targetNode);

        const dotContext = this.getDotAccessContext(targetNode, previousNode, text, offset);
        if (dotContext) {
            return collectVisibleModuleSymbols(dotContext).map(symbol => this.createSymbolCompletionItem(symbol));
        }

        if (this.isModuleReferenceContext(targetNode)) {
            return collectDeclaredModules(root).map(symbol => this.createSymbolCompletionItem(symbol));
        }

        if (!module) {
            return [];
        }

        if (this.isVariablePathHeadContext(targetNode, text, offset)) {
            return collectVisibleModuleSymbols(module).map(symbol => this.createSymbolCompletionItem(symbol));
        }

        if (!this.isExpressionContext(targetNode)) {
            return [];
        }

        const enumItems = this.getEnumAssignmentValues(targetNode).map(value => this.createSymbolCompletionItem(value));
        const scopeItems = collectVisibleModuleSymbols(module).map(symbol => this.createSymbolCompletionItem(symbol));
        return [...scopeItems, ...enumItems, ...BUILTIN_LITERAL_ITEMS];
    }

    private getDotAccessCompletionItems(document, params: CompletionParams) {
        const root = document.parseResult.value;
        const cstRoot = root.$cstNode;
        if (!cstRoot) {
            return undefined;
        }

        const text = document.textDocument.getText();
        const offset = document.textDocument.offsetAt(params.position);
        const currentNode = this.findAstNodeNearOffset(cstRoot, text, offset, 1)
            ?? this.findAstNodeNearOffset(cstRoot, text, offset, -1);
        const previousNode = offset > 0 ? this.findAstNodeNearOffset(cstRoot, text, offset - 1, -1) : undefined;
        const targetNode = currentNode ?? previousNode ?? root;
        if (!this.isDotAccessCompletionContext(targetNode, previousNode, text, offset)) {
            return undefined;
        }

        const dotContext = this.getDotAccessContext(targetNode, previousNode, text, offset);
        return dotContext
            ? collectVisibleModuleSymbols(dotContext).map(symbol => this.createSymbolCompletionItem(symbol))
            : [];
    }

    private findAstNodeNearOffset(cstRoot: AstNode['$cstNode'], text: string, startOffset: number, direction: -1 | 1): AstNode | undefined {
        if (text.length === 0) {
            return undefined;
        }
        let offset = Math.max(0, Math.min(startOffset, text.length - 1));
        while (offset >= 0 && offset < text.length) {
            const node = cstRoot ? CstUtils.findLeafNodeAtOffset(cstRoot, offset)?.astNode : undefined;
            if (node) {
                return node;
            }
            offset += direction;
        }
        return undefined;
    }

    private getDotAccessContext(targetNode: AstNode, previousNode: AstNode | undefined, text: string, offset: number): Module | undefined {
        const previousCharacter = offset > 0 ? text[offset - 1] : undefined;
        const path = this.findSelfOrContainer(targetNode, isVariablePath)
            ?? (previousNode ? this.findSelfOrContainer(previousNode, isVariablePath) : undefined);
        if (!path) {
            return undefined;
        }

        if (previousCharacter === '.') {
            return resolvePathTargetModule(path, Math.max(0, path.segments.length - 1));
        }

        const segment = this.findSelfOrContainer(targetNode, isDotSegment)
            ?? (previousNode ? this.findSelfOrContainer(previousNode, isDotSegment) : undefined);
        if (!segment) {
            return undefined;
        }

        const segmentIndex = path.segments.indexOf(segment);
        return segmentIndex >= 0 ? resolvePathTargetModule(path, segmentIndex) : undefined;
    }

    private isDotAccessCompletionContext(targetNode: AstNode, previousNode: AstNode | undefined, text: string, offset: number): boolean {
        if (offset > 0 && text[offset - 1] === '.') {
            return true;
        }
        return !!(this.findSelfOrContainer(targetNode, isDotSegment)
            ?? (previousNode ? this.findSelfOrContainer(previousNode, isDotSegment) : undefined));
    }

    private isVariablePathHeadContext(targetNode: AstNode, text: string, offset: number): boolean {
        if (offset > 0 && text[offset - 1] === '.') {
            return false;
        }
        const path = this.findSelfOrContainer(targetNode, isVariablePath);
        if (!path) {
            return false;
        }
        if (this.findSelfOrContainer(targetNode, isDotSegment)) {
            return false;
        }
        return targetNode === path || targetNode.$container === path;
    }

    private isModuleReferenceContext(targetNode: AstNode): boolean {
        const container = this.findSelfOrContainer(targetNode, node => isAsyncProcessType(node) || isSyncProcessType(node));
        return !!container;
    }

    private isExpressionContext(targetNode: AstNode): boolean {
        return !!AstUtils.getContainerOfType(targetNode, isExpressionContainer)
            || isExpressionContainer(targetNode);
    }

    private getEnumAssignmentValues(targetNode: AstNode): EnumValue[] {
        const assignment = this.findSelfOrContainer(targetNode, isAssignmentLikeContainer);
        if (!assignment || !('var' in assignment)) {
            return [];
        }
        const symbol = resolveSymbol(assignment.var);
        return isVarBody(symbol) && isEnumType(symbol.type)
            ? symbol.type.values
            : [];
    }

    private findSelfOrContainer<T extends AstNode>(targetNode: AstNode, predicate: (node: AstNode) => node is T): T | undefined {
        return predicate(targetNode) ? targetNode : AstUtils.getContainerOfType(targetNode, predicate);
    }

    private createSymbolCompletionItem(symbol: NuSMVSymbol) {
        return {
            label: symbol.name,
            kind: completionItemKindForSymbol(symbol),
            detail: completionDetailForSymbol(symbol),
            sortText: '0'
        };
    }
}

function completionItemKindForSymbol(symbol: NuSMVSymbol): CompletionItemKind {
    if (isModule(symbol)) {
        return CompletionItemKind.Module;
    }
    if (isVarBody(symbol)) {
        return CompletionItemKind.Variable;
    }
    if (isFormalParameter(symbol)) {
        return CompletionItemKind.Variable;
    }
    if (isDefineBody(symbol)) {
        return CompletionItemKind.Function;
    }
    if (isConstantSymbol(symbol)) {
        return CompletionItemKind.Constant;
    }
    if (isEnumValue(symbol)) {
        return CompletionItemKind.EnumMember;
    }
    return CompletionItemKind.Text;
}

function completionDetailForSymbol(symbol: NuSMVSymbol): string {
    if (isModule(symbol)) {
        return 'Module';
    }
    if (isVarBody(symbol)) {
        return 'Variable';
    }
    if (isFormalParameter(symbol)) {
        return 'Parameter';
    }
    if (isDefineBody(symbol)) {
        return 'Define';
    }
    if (isConstantSymbol(symbol)) {
        return 'Constant';
    }
    if (isEnumValue(symbol)) {
        return 'EnumValue';
    }
    return 'Symbol';
}

function createLiteralItem(label: string) {
    return {
        label,
        kind: CompletionItemKind.Constant,
        detail: 'Builtin',
        sortText: '0'
    };
}

function isAssignmentLikeContainer(node: AstNode): node is InitBody | NextBody | VarBodyAssign {
    return isInitBody(node) || isNextBody(node) || isVarBodyAssign(node);
}

function isExpressionContainer(node: AstNode): node is
    | CaseBranch
    | CompassionExpression
    | ComputeSpecification
    | CtlSpecification
    | FairnessExpression
    | InitBody
    | InitConstraint
    | InvarConstraint
    | InvarSpecification
    | JusticeExpression
    | LtlSpecification
    | NextBody
    | PslSpecification
    | TransConstraint
    | VarBodyAssign {
    return isCaseBranch(node)
        || isCompassionExpression(node)
        || isComputeSpecification(node)
        || isCtlSpecification(node)
        || isFairnessExpression(node)
        || isInitBody(node)
        || isInitConstraint(node)
        || isInvarConstraint(node)
        || isInvarSpecification(node)
        || isJusticeExpression(node)
        || isLtlSpecification(node)
        || isNextBody(node)
        || isPslSpecification(node)
        || isTransConstraint(node)
        || isVarBodyAssign(node);
}
