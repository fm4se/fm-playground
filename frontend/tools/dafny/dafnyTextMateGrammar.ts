import type * as monaco from 'monaco-editor';

const dafnyConf: monaco.languages.LanguageConfiguration = {
    comments: {
        lineComment: '//',
        blockComment: ['/*', '*/'],
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
        ['<', '>'],
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '<', close: '>' },
        { open: '"', close: '"', notIn: ['string'] },
        { open: '/*', close: ' */', notIn: ['string'] },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '<', close: '>' },
        { open: '"', close: '"' },
    ],
    folding: {
        markers: {
            start: new RegExp('^\\s*//\\s*#?region\\b'),
            end: new RegExp('^\\s*//\\s*#?endregion\\b'),
        },
    },
};

const dafnyLang: monaco.languages.IMonarchLanguage = {
    keywords: [
        'abstract',
        'allocated',
        'as',
        'assert',
        'assume',
        'break',
        'by',
        'calc',
        'case',
        'class',
        'codatatype',
        'const',
        'constructor',
        'continue',
        'datatype',
        'decreases',
        'downto',
        'else',
        'ensures',
        'exists',
        'expect',
        'export',
        'extends',
        'false',
        'for',
        'forall',
        'fresh',
        'function',
        'ghost',
        'greatest',
        'if',
        'import',
        'in',
        'include',
        'invariant',
        'is',
        'iterator',
        'label',
        'least',
        'lemma',
        'match',
        'method',
        'modify',
        'modifies',
        'module',
        'nameonly',
        'new',
        'newtype',
        'null',
        'old',
        'opaque',
        'opened',
        'predicate',
        'print',
        'provides',
        'reads',
        'refines',
        'requires',
        'return',
        'returns',
        'reveal',
        'reveals',
        'static',
        'then',
        'this',
        'to',
        'trait',
        'true',
        'twostate',
        'type',
        'unchanged',
        'var',
        'while',
        'witness',
        'yield',
        'yields',
    ],

    typeKeywords: [
        'bool',
        'char',
        'real',
        'multiset',
        'map',
        'imap',
        'nat',
        'int',
        'ORDINAL',
        'object',
        'string',
        'set',
        'iset',
        'seq',
        'array',
        'bv0',
    ],

    operators: [
        '=',
        '>',
        '<',
        '!',
        '~',
        '?',
        ':',
        '==',
        '<=',
        '>=',
        '!=',
        '&&',
        '||',
        '++',
        '--',
        '+',
        '-',
        '*',
        '/',
        '&',
        '|',
        '^',
        '%',
        '<<',
        '>>',
        '>>>',
        '+=',
        '-=',
        '*=',
        '/=',
        '&=',
        '|=',
        '^=',
        '%=',
        '<<=',
        '>>=',
        '>>>=',
        ':=',
        ':|',
        '<==',
        '==>',
        '<==>',
    ],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    tokenizer: {
        root: [
            // whitespace
            [/[ \t\r\n]+/, ''],

            // comments
            [/\/\/.*$/, 'comment'],
            [/\/\*/, 'comment', '@comment'],

            // strings
            [/@"/, 'string', '@stringMultiline'],
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, 'string', '@string'],

            // characters
            [/'[^\\']'/, 'string'],
            [/'/, 'string.invalid'],

            // numbers
            [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/\d+/, 'number'],

            // attributes
            [/@[a-zA-Z_]\w*/, 'annotation'],
            [/\{:[a-zA-Z_]\w*/, 'annotation', '@attributeBrace'],

            // keywords and identifiers
            [
                /[a-zA-Z_][\w'?]*/,
                {
                    cases: {
                        '@typeKeywords': 'keyword.type',
                        '@keywords': 'keyword',
                        '@default': 'identifier',
                    },
                },
            ],

            // delimiters and operators
            [/[{}()\[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [
                /@symbols/,
                {
                    cases: {
                        '@operators': 'operator',
                        '@default': '',
                    },
                },
            ],
            [/[;,.]/, 'delimiter'],
        ],

        comment: [
            [/[^\/*]+/, 'comment'],
            [/\/\*/, 'comment', '@push'],
            [/\*\//, 'comment', '@pop'],
            [/[\/*]/, 'comment'],
        ],

        string: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, 'string', '@pop'],
        ],

        stringMultiline: [
            [/[^"]+/, 'string'],
            [/""/, 'string.escape'],
            [/"/, 'string', '@pop'],
        ],

        attributeBrace: [
            [/[^}]+/, 'annotation'],
            [/\}/, 'annotation', '@pop'],
        ],
    },
};

export { dafnyConf, dafnyLang };
