import { CompletionAcceptor, CompletionContext, CompletionValueItem, DefaultCompletionProvider, NextFeature } from 'langium/lsp';
import { CompletionItemKind } from 'vscode-languageserver';
import { GrammarAST } from 'langium';

export class AlloyCompletionProvider extends DefaultCompletionProvider {

    protected override completionForKeyword(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): void {
        // Create a map of keyword replacements for better user experience
        const keywordLabels: Record<string, string> = {
            'sig': 'signature',
            'enum': 'enumeration',
            'fact': 'fact declaration',
            'pred': 'predicate',
            'fun': 'function',
            'assert': 'assertion',
            'run': 'run command',
            'check': 'check command',
            'module': 'module declaration',
            'open': 'import statement',
            'abstract': 'abstract modifier',
            'var': 'variable modifier',
            'extends': 'extends clause',
            'in': 'in clause',
            'disj': 'disjoint modifier',
            'exactly': 'exactly scope',
            'for': 'scope declaration',
            'but': 'but clause',
            'expect': 'expected instances',
            'let': 'let binding',
            'all': 'universal quantifier',
            'some': 'existential quantifier',
            'no': 'no quantifier',
            'lone': 'lone quantifier',
            'one': 'one quantifier',
            'set': 'set quantifier',
            'this': 'this reference',
            'univ': 'universe',
            'none': 'empty set',
            'iden': 'identity relation'
        };

        const keywordValue = keyword.value;
        const label = keywordLabels[keywordValue] || keywordValue;
        const completionItem: CompletionValueItem = {
            label,
            kind: CompletionItemKind.Keyword,
            detail: `Alloy keyword: ${keywordValue}`,
            insertText: keywordValue,
            sortText: `0_${keywordValue}` // Sort keywords first
        };
        acceptor(context, completionItem);
    }

    protected override completionFor(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): void {
        if (GrammarAST.isKeyword(next.feature)) {
            return this.completionForKeyword(context, next.feature, acceptor);
        }

        // Handle other grammar elements like rules
        if (next.type) {
            // Create a map of rule names to user-friendly labels
            const ruleLabels: Record<string, { label: string; detail: string; kind: CompletionItemKind }> = {
                'EnumDecl': { 
                    label: 'enum declaration', 
                    detail: 'Create an enumeration',
                    kind: CompletionItemKind.Enum 
                },
                'SigDecl': { 
                    label: 'signature declaration', 
                    detail: 'Create a signature',
                    kind: CompletionItemKind.Class 
                },
                'FactDecl': { 
                    label: 'fact declaration', 
                    detail: 'Create a fact constraint',
                    kind: CompletionItemKind.Property 
                },
                'PredDecl': { 
                    label: 'predicate declaration', 
                    detail: 'Create a predicate',
                    kind: CompletionItemKind.Function 
                },
                'FunDecl': { 
                    label: 'function declaration', 
                    detail: 'Create a function',
                    kind: CompletionItemKind.Function 
                },
                'AssertDecl': { 
                    label: 'assertion declaration', 
                    detail: 'Create an assertion',
                    kind: CompletionItemKind.Property 
                },
                'CmdDecl': { 
                    label: 'command declaration', 
                    detail: 'Create a run or check command',
                    kind: CompletionItemKind.Method 
                },
                'FieldDecl': { 
                    label: 'field declaration', 
                    detail: 'Create a field',
                    kind: CompletionItemKind.Field 
                },
                'ModuleDecl': { 
                    label: 'module declaration', 
                    detail: 'Create a module',
                    kind: CompletionItemKind.Module 
                },
                'Import': { 
                    label: 'import statement', 
                    detail: 'Import another module',
                    kind: CompletionItemKind.Reference 
                },
                'Decl': { 
                    label: 'variable declaration', 
                    detail: 'Create a variable declaration',
                    kind: CompletionItemKind.Variable 
                },
                'LetDecl': { 
                    label: 'let binding', 
                    detail: 'Create a let binding',
                    kind: CompletionItemKind.Variable 
                },
                'Expr': { 
                    label: 'expression', 
                    detail: 'Create an expression',
                    kind: CompletionItemKind.Value 
                },
                'Block': { 
                    label: 'block expression', 
                    detail: 'Create a block',
                    kind: CompletionItemKind.Snippet 
                },
                'Scope': { 
                    label: 'scope declaration', 
                    detail: 'Create a scope constraint',
                    kind: CompletionItemKind.Property 
                }
            };

            const ruleName = next.type;
            const ruleInfo = ruleLabels[ruleName];
            
            if (ruleInfo) {
                const completionItem: CompletionValueItem = {
                    label: ruleInfo.label,
                    kind: ruleInfo.kind,
                    detail: ruleInfo.detail,
                    sortText: `1_${ruleInfo.label}` // Sort after keywords
                };
                acceptor(context, completionItem);
                return;
            }
        }

        // Fall back to default behavior for unmapped features
        super.completionFor(context, next, acceptor);
    }
}
