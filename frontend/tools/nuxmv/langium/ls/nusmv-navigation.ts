import { AstUtils, CstUtils, GrammarUtils, type AstNode, type CstNode, type LeafCstNode } from 'langium';
import { DefaultDefinitionProvider, type DeclarationProvider } from 'langium/lsp';
import { LocationLink, type DeclarationParams, type DefinitionParams } from 'vscode-languageserver';
import type { CancellationToken } from 'vscode-languageserver/node.js';
import {
    isAsyncProcessType,
    isConstantSymbol,
    isDefineBody,
    isDotSegment,
    isEnumValue,
    isFormalParameter,
    isModule,
    isSyncProcessType,
    isVarBody,
    isVariablePath
} from './generated/ast.js';
import type { DotSegment, VariablePath } from './generated/ast.js';
import { NuSMVServices } from './nusmv-module.js';
import type { NuSMVSymbol } from './nusmv-symbols.js';
import { resolveContextualEnumLiteral, resolvePathSymbol } from './nusmv-types.js';

export class NuSMVDefinitionProvider extends DefaultDefinitionProvider {

    constructor(services: NuSMVServices) {
        super(services);
    }

    override getDefinition(document, params: DefinitionParams, cancelToken?: CancellationToken) {
        return this.getNuSMVDefinition(document, params) ?? super.getDefinition(document, params, cancelToken);
    }

    protected getNuSMVDefinition(document, params: DefinitionParams): LocationLink[] | undefined {
        const root = document.parseResult.value;
        const source = CstUtils.findDeclarationNodeAtOffset(
            root.$cstNode,
            document.textDocument.offsetAt(params.position),
            this.grammarConfig.nameRegexp
        );
        if (!source) {
            return undefined;
        }

        const target = this.resolveTargetSymbol(source);
        if (!target) {
            return undefined;
        }

        const link = this.createLocationLink(source, target);
        return link ? [link] : undefined;
    }

    protected resolveTargetSymbol(source: LeafCstNode): NuSMVSymbol | undefined {
        const sourceAstNode = source.astNode;
        const declaration = this.resolveDeclarationName(source, sourceAstNode);
        if (declaration) {
            return declaration;
        }

        const moduleType = this.findSelfOrContainer(sourceAstNode, node => isAsyncProcessType(node) || isSyncProcessType(node));
        if (moduleType && this.isSourceForProperty(source, moduleType, 'module')) {
            return moduleType.module?.ref;
        }

        const dotSegment = this.findSelfOrContainer(sourceAstNode, isDotSegment);
        if (dotSegment && this.isSourceForProperty(source, dotSegment, 'symbol')) {
            return this.resolveDotSegmentSymbol(dotSegment);
        }

        const path = this.findSelfOrContainer(sourceAstNode, isVariablePath);
        if (path && this.isSourceForProperty(source, path, 'head')) {
            return resolvePathSymbol(path, 0) ?? resolveContextualEnumLiteral(path);
        }

        return undefined;
    }

    protected createLocationLink(source: LeafCstNode, target: NuSMVSymbol): LocationLink | undefined {
        const targetSelection = this.findNameNode(target);
        const targetCst = target.$cstNode ?? targetSelection;
        if (!targetSelection || !targetCst) {
            return undefined;
        }
        const targetDocument = AstUtils.getDocument(target);
        return LocationLink.create(
            targetDocument.textDocument.uri,
            targetCst.range,
            targetSelection.range,
            source.range
        );
    }

    private resolveDotSegmentSymbol(segment: DotSegment): NuSMVSymbol | undefined {
        const path = segment.$container as VariablePath;
        const segmentIndex = path.segments.indexOf(segment);
        return segmentIndex >= 0
            ? resolvePathSymbol(path, segmentIndex + 1)
            : undefined;
    }

    private resolveDeclarationName(source: LeafCstNode, sourceAstNode: AstNode): NuSMVSymbol | undefined {
        if (isNamedSymbol(sourceAstNode) && this.isSourceForProperty(source, sourceAstNode, 'name')) {
            return sourceAstNode;
        }
        return undefined;
    }

    private findNameNode(symbol: NuSMVSymbol): CstNode | undefined {
        return GrammarUtils.findNodeForProperty(symbol.$cstNode, 'name') ?? symbol.$cstNode;
    }

    private isSourceForProperty(source: LeafCstNode, astNode: AstNode, property: string): boolean {
        const propertyNode = GrammarUtils.findNodeForProperty(astNode.$cstNode, property);
        return !!propertyNode && (propertyNode === source || CstUtils.isChildNode(source, propertyNode));
    }

    private findSelfOrContainer<T extends AstNode>(node: AstNode, predicate: (candidate: AstNode) => candidate is T): T | undefined {
        return predicate(node) ? node : AstUtils.getContainerOfType(node, predicate);
    }
}

export class NuSMVDeclarationProvider extends NuSMVDefinitionProvider implements DeclarationProvider {

    getDeclaration(document, params: DeclarationParams, cancelToken?: CancellationToken) {
        return this.getDefinition(document, params as DefinitionParams, cancelToken);
    }
}

function isNamedSymbol(node: AstNode): node is NuSMVSymbol {
    return isModule(node)
        || isVarBody(node)
        || isFormalParameter(node)
        || isDefineBody(node)
        || isConstantSymbol(node)
        || isEnumValue(node);
}
