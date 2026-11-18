import type * as monaco from 'monaco-editor';

const alloyConf: monaco.languages.LanguageConfiguration = {
    comments: {
        lineComment: '//',
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
    ],
};

const alloyLang: monaco.languages.IMonarchLanguage = {
    keywords: [
        'one',
        'lone',
        'none',
        'some',
        'abstract',
        'all',
        'iff',
        'but',
        'else',
        'extends',
        'set',
        'implies',
        'module',
        'open',
        'and',
        'disj',
        'for',
        'in',
        'no',
        'or',
        'as',
        'Int',
        'String',
        'sum',
        'exactly',
        'iden',
        'let',
        'not',
        'univ',
        'enum',
        'var',
        'steps',
        'always',
        'historically',
        'eventually',
        'once',
        'after',
        'before',
        'until',
        'since',
        'releases',
        'triggered',
        'check',
        'fact',
        'sig',
        'fun',
        'pred',
        'assert',
        'run',
    ],

    operators: [
        '=>',
        '<=>',
        '++',
        '=<',
        '->',
        '>=',
        '||',
        '<:',
        ':>',
        '&&',
        '!=',
        '+',
        '-',
        '&',
        '.',
        '~',
        '*',
        '^',
        '!',
        '#',
    ],

    // we include these common regular expressions
    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    // The main tokenizer for our languages
    tokenizer: {
        root: [
            // identifiers and keywords
            [/[a-zA-Z_][\w$]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
            [/[A-Z][\w\$]*/, 'type.identifier'],

            // whitespace
            { include: '@whitespace' },

            // delimiters and operators
            [/[{}()\[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],

            // numbers
            [/[0-9]/, 'number'],

            // delimiter: after number because of .\d floats
            [/[;,.]/, 'delimiter'],

            // strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-teminated string
            [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],

            // characters
            [/'[^\\']'/, 'string'],
            [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
            [/'/, 'string.invalid'],
        ],

        comment: [
            [/[^\/*]+/, 'comment'],
            [/\/\*/, 'comment', '@push'], // nested comment
            ['\\*/', 'comment', '@pop'],
            [/[\/*]/, 'comment'],
        ],

        string: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
        ],

        whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/\/\*/, 'comment', '@comment'],
            [/\/\/.*$/, 'comment'],
            [/\s*--.*$/, 'comment'],
        ],
    },
};

export { alloyConf, alloyLang };
