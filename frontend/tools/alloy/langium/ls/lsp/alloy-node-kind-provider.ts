import type { AstNode, AstNodeDescription } from 'langium';
import { DefaultNodeKindProvider } from 'langium/lsp';
import { CompletionItemKind, SymbolKind } from 'vscode-languageserver';
import { isDeclName, isFieldDecl } from '../generated/ast.js';

/** Symbol and completion kinds of Alloy declarations. */
export class AlloyNodeKindProvider extends DefaultNodeKindProvider {

    override getSymbolKind(node: AstNode | AstNodeDescription): SymbolKind {
        const type = '$type' in node ? node.$type : node.type;
        switch (type) {
            case 'SigDecl': case 'AdditionalSig': return SymbolKind.Class;
            case 'EnumDecl': return SymbolKind.Enum;
            case 'EnumValue': return SymbolKind.EnumMember;
            case 'PredDecl': return SymbolKind.Method;
            case 'FunDecl': return SymbolKind.Function;
            case 'FactDecl': return SymbolKind.Property;
            case 'AssertDecl': return SymbolKind.Boolean;
            case 'CmdDecl': return SymbolKind.Event;
            case 'MacroDecl': return SymbolKind.Operator;
            case 'ModuleParam': return SymbolKind.TypeParameter;
            case 'DeclName':
                // Descriptions do not carry the container; exported DeclNames are fields.
                return !('$type' in node) || (isDeclName(node) && isFieldDecl(node.$container.$container)) ? SymbolKind.Field : SymbolKind.Variable;
            default: return SymbolKind.Variable;
        }
    }

    override getCompletionItemKind(node: AstNode | AstNodeDescription): CompletionItemKind {
        switch (this.getSymbolKind(node)) {
            case SymbolKind.Class: return CompletionItemKind.Class;
            case SymbolKind.Enum: return CompletionItemKind.Enum;
            case SymbolKind.EnumMember: return CompletionItemKind.EnumMember;
            case SymbolKind.Method: return CompletionItemKind.Method;
            case SymbolKind.Function: return CompletionItemKind.Function;
            case SymbolKind.Field: return CompletionItemKind.Field;
            case SymbolKind.TypeParameter: return CompletionItemKind.TypeParameter;
            case SymbolKind.Operator: return CompletionItemKind.Operator;
            case SymbolKind.Property: case SymbolKind.Boolean: return CompletionItemKind.Property;
            default: return CompletionItemKind.Variable;
        }
    }
}
