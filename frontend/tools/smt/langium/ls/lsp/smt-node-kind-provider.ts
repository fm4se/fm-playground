import type { AstNode, AstNodeDescription } from 'langium';
import { DefaultNodeKindProvider } from 'langium/lsp';
import { CompletionItemKind, SymbolKind } from 'vscode-languageserver';

/** Symbol and completion kinds for SMT-LIB declarations. */
export class SmtNodeKindProvider extends DefaultNodeKindProvider {

    override getSymbolKind(node: AstNode | AstNodeDescription): SymbolKind {
        switch ('$type' in node ? node.$type : node.type) {
            case 'DeclareConst': case 'DefineConst': case 'DeclareVar': return SymbolKind.Constant;
            case 'DeclareFun': case 'FunctionDef': case 'FunctionDec': case 'DeclareRel': return SymbolKind.Function;
            case 'ConstructorDec': return SymbolKind.EnumMember;
            case 'SelectorDec': return SymbolKind.Field;
            case 'SortedVar': case 'VarBinding': case 'PatternVariable': return SymbolKind.Variable;
            case 'NamedAttribute': return SymbolKind.Key;
            case 'DeclareSort': case 'DefineSort': return SymbolKind.Class;
            case 'DeclareDatatype': case 'SortDec': case 'LegacyDatatypeDec': return SymbolKind.Enum;
            case 'SortParameter': case 'DeclareSortParameter': case 'DeclareTypeVar': return SymbolKind.TypeParameter;
            default: return SymbolKind.Field;
        }
    }

    override getCompletionItemKind(node: AstNode | AstNodeDescription): CompletionItemKind {
        switch (this.getSymbolKind(node)) {
            case SymbolKind.Constant: return CompletionItemKind.Constant;
            case SymbolKind.Function: return CompletionItemKind.Function;
            case SymbolKind.EnumMember: return CompletionItemKind.EnumMember;
            case SymbolKind.Variable: return CompletionItemKind.Variable;
            case SymbolKind.Class: return CompletionItemKind.Class;
            case SymbolKind.Enum: return CompletionItemKind.Enum;
            case SymbolKind.TypeParameter: return CompletionItemKind.TypeParameter;
            default: return CompletionItemKind.Reference;
        }
    }
}
