import * as monaco from 'monaco-editor';

function createDependencyProposals(range: monaco.Range): monaco.languages.CompletionItem[] {
    // returning a static list of proposals, not even looking at the prefix (filtering is done by the Monaco editor),
    // FIXME: probably we should remove this as we have the LSP server now. 
    return [
        {
            label: 'declare-const',
            kind: monaco.languages.CompletionItemKind.Function,
            documentation: 'The command declare-const declares a constant of a given type (aka sort)',
            insertText: '( declare-const <symbol> <sort> )',
            range: range,
        },
        {
            label: 'declare-fun',
            kind: monaco.languages.CompletionItemKind.Function,
            documentation: '',
            insertText: '(declare-fun f (Int Bool) Int)',
            range: range,
        },
        {
            label: 'declare-sort',
            kind: monaco.languages.CompletionItemKind.Function,
            documentation: '(define-sort [symbol] ([symbol]+) [sort])',
            insertText: '(define-sort I () Int)',
            range: range,
        },
        {
            label: 'declare-rel',
            kind: monaco.languages.CompletionItemKind.Function,
            documentation: '',
            insertText: '(declare-rel a ())',
            range: range,
        },
        {
            label: 'declare-var',
            kind: monaco.languages.CompletionItemKind.Function,
            documentation: '',
            insertText: '(declare-var a s)',
            range: range,
        },
        {
            label: 'get-model',
            kind: monaco.languages.CompletionItemKind.Function,
            documentation: '',
            insertText: '(check-sat)\n(get-model)',
            range: range,
        },
        {
            label: 'check-sat',
            kind: monaco.languages.CompletionItemKind.Function,
            documentation: '',
            insertText: '(check-sat)',
            range: range,
        },
    ];
}

const smt2ComplitionProvider = {
    // triggerCharacters: ['=', '&gt;', '&lt;', '&lt;=', '&gt;=', '=&gt;', '+', '-', '*', '/'],
    provideCompletionItems: function (
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): monaco.languages.CompletionList {
        var word = model.getWordUntilPosition(position);
        var range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        return {
            suggestions: createDependencyProposals(range),
        };
    },
};

export { smt2ComplitionProvider };
