import type { AstNode } from 'langium';
import { AbstractSemanticTokenProvider, type SemanticTokenAcceptor } from 'langium/lsp';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import {
    AsyncProcessType,
    BinaryExpression,
    CaseExpression,
    DotSegment,
    FunctionCallExpression,
    InitBody,
    isAsyncProcessType,
    isBinaryExpression,
    isCaseExpression,
    isDefineBody,
    isDotSegment,
    isEnumValue,
    isFormalParameter,
    isFunctionCallExpression,
    isInitBody,
    isModule,
    isNextBody,
    isNextCallExpression,
    isSyncProcessType,
    isUnaryExpression,
    isUntilCtlExpression,
    isVariablePath,
    Module,
    NextBody,
    NextCallExpression,
    SyncProcessType,
    UnaryExpression,
    UntilCtlExpression,
    VariablePath
} from './generated/ast.js';
import type { NuSMVSymbol } from './nusmv-symbols.js';
import { resolveContextualEnumLiteral, resolvePathSymbol } from './nusmv-types.js';

export class NuSMVSemanticTokenProvider extends AbstractSemanticTokenProvider {

    protected override highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void {
        if (isFormalParameter(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.parameter
            });
            return;
        }
        if (isAsyncProcessType(node) || isSyncProcessType(node)) {
            this.highlightModuleReference(acceptor, node);
            return;
        }
        if (isVariablePath(node)) {
            this.highlightVariablePath(node, acceptor);
            return;
        }
        if (isDotSegment(node)) {
            this.highlightDotSegment(node, acceptor);
            return;
        }
        if (isUnaryExpression(node)) {
            this.highlightUnaryOperator(node, acceptor);
            return;
        }
        if (isBinaryExpression(node)) {
            this.highlightBinaryOperator(node, acceptor);
            return;
        }
        if (isUntilCtlExpression(node)) {
            this.highlightUntilOperator(node, acceptor);
            return;
        }
        if (isFunctionCallExpression(node)) {
            acceptor({
                node,
                property: 'function',
                type: SemanticTokenTypes.function,
                modifier: SemanticTokenModifiers.defaultLibrary
            });
            return;
        }
        if (isNextCallExpression(node)) {
            this.acceptKeyword(acceptor, node, 'next');
            return;
        }
        if (isInitBody(node) || isNextBody(node)) {
            this.highlightAssignmentKeyword(node, acceptor);
            return;
        }
        if (isCaseExpression(node)) {
            this.highlightCaseKeywords(node, acceptor);
        }
    }

    private highlightModuleReference(acceptor: SemanticTokenAcceptor, node: AsyncProcessType | SyncProcessType): void {
        acceptor({
            node,
            property: 'module',
            type: SemanticTokenTypes.type
        });
    }

    private highlightVariablePath(node: VariablePath, acceptor: SemanticTokenAcceptor): void {
        const symbol = resolvePathSymbol(node, 0);
        if (symbol) {
            acceptor({
                node,
                property: 'head',
                type: semanticTypeForSymbol(symbol)
            });
            return;
        }

        const enumLiteral = resolveContextualEnumLiteral(node);
        if (enumLiteral) {
            acceptor({
                node,
                property: 'head',
                type: SemanticTokenTypes.enumMember
            });
        }
    }

    private highlightDotSegment(node: DotSegment, acceptor: SemanticTokenAcceptor): void {
        const path = node.$container;
        if (!isVariablePath(path)) {
            return;
        }
        const segmentIndex = path.segments.indexOf(node);
        if (segmentIndex < 0) {
            return;
        }
        const symbol = resolvePathSymbol(path, segmentIndex + 1);
        if (!symbol) {
            return;
        }
        acceptor({
            node,
            property: 'symbol',
            type: semanticTypeForSymbol(symbol)
        });
    }

    private highlightUnaryOperator(node: UnaryExpression, acceptor: SemanticTokenAcceptor): void {
        const type = isTemporalKeyword(node.operator)
            ? SemanticTokenTypes.keyword
            : SemanticTokenTypes.operator;
        acceptor({
            node,
            property: 'operator',
            type
        });
    }

    private highlightBinaryOperator(node: BinaryExpression, acceptor: SemanticTokenAcceptor): void {
        const type = isKeywordBinaryOperator(node.operator)
            ? SemanticTokenTypes.keyword
            : SemanticTokenTypes.operator;
        acceptor({
            node,
            property: 'operator',
            type
        });
    }

    private highlightUntilOperator(node: UntilCtlExpression, acceptor: SemanticTokenAcceptor): void {
        acceptor({
            node,
            property: 'quantifier',
            type: SemanticTokenTypes.keyword
        });
    }

    private highlightAssignmentKeyword(node: InitBody | NextBody, acceptor: SemanticTokenAcceptor): void {
        acceptor({
            node,
            keyword: isInitBody(node) ? 'init' : 'next',
            type: SemanticTokenTypes.keyword
        });
    }

    private highlightCaseKeywords(node: CaseExpression, acceptor: SemanticTokenAcceptor): void {
        acceptor({
            node,
            keyword: 'case',
            type: SemanticTokenTypes.keyword
        });
        acceptor({
            node,
            keyword: 'esac',
            type: SemanticTokenTypes.keyword
        });
    }

    private acceptKeyword(acceptor: SemanticTokenAcceptor, node: AstNode, keyword: string): void {
        acceptor({
            node,
            keyword,
            type: SemanticTokenTypes.keyword
        });
    }
}

function semanticTypeForSymbol(symbol: NuSMVSymbol): string {
    if (isModule(symbol)) {
        return SemanticTokenTypes.type;
    }
    if (isFormalParameter(symbol)) {
        return SemanticTokenTypes.parameter;
    }
    if (isDefineBody(symbol)) {
        return SemanticTokenTypes.function;
    }
    if (isEnumValue(symbol)) {
        return SemanticTokenTypes.enumMember;
    }
    return SemanticTokenTypes.property;
}

function isTemporalKeyword(operator: UnaryExpression['operator']): boolean {
    return ['EG', 'EX', 'EF', 'AG', 'AX', 'AF', 'X', 'G', 'F', 'Y', 'Z', 'H', 'O'].includes(operator);
}

function isKeywordBinaryOperator(operator: BinaryExpression['operator']): boolean {
    return ['U', 'V', 'S', 'T', 'in', 'union', 'mod', 'xor', 'xnor'].includes(operator);
}
