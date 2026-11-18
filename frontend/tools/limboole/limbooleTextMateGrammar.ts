import type * as monacoEditor from 'monaco-editor';

const limbooleConf: monacoEditor.languages.LanguageConfiguration = {
    comments: {
        lineComment: '%',
    },
    autoClosingPairs: [{ open: '(', close: ')' }],
    brackets: [['(', ')']],
    surroundingPairs: [{ open: '(', close: ')' }],
};

const limbooleLang: monacoEditor.languages.IMonarchLanguage = {
    operators: ['<->', '->', '<-', '&', '|', '/', '!'],

    // operators
    symbols: /([\.]{2})|([=><!:&\|\+\-\*\/,;]+)/,

    // escape sequences
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    tokenizer: {
        root: [
            // operators
            [/@symbols/, { cases: { '@operators': 'keyword' } }],

            // whitespace
            { include: '@whitespace' },
        ],

        whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/(^%.*$)/, 'comment'],
        ],
    },
};

export { limbooleConf, limbooleLang };
