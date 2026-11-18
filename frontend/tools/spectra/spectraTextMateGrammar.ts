import type * as monaco from 'monaco-editor';

const spectraConf: monaco.languages.LanguageConfiguration = {
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

/* Spectra language definition (borrowed from monaco editor languages) */
const spectraLang: monaco.languages.IMonarchLanguage = {
    // Set defaultToken to invalid to see what you do not tokenize yet
    // defaultToken: 'invalid',

    keywords: [
        'module',
        'spec',
        'import',
        'define',
        'weight',
        'output',
        'out',
        'sysvar',
        'sys',
        'input',
        'in',
        'envvar',
        'env',
        'auxvar',
        'aux',
        'type',
        'define',
        'keep',
        'false',
        'modulo',
        'counter',
        'monitor',
        'ini',
        'initially',
        'G',
        'trans',
        'always',
        'alw',
        'pattern',
        'var',
        'GF',
        'alwEv',
        'alwaysEventually',
        'predicate',
        'boolean',
        'Int',
        'guarantee',
        'gar',
        'ini',
        'initially',
        'assumption',
        'asm',
        'GE',
        'GEF',
        'regtest',
        'S',
        'SINCE',
        'T',
        'TRIGGERED',
        'Y',
        'PREV',
        'H',
        'HISTORICALLY',
        'O',
        'ONCE',
        'next',
        'regexp',
        '.all',
        'any',
        'prod',
        'sum',
        'min',
        'max',
        'FALSE',
        'TRUE',
        'true',
        'trig',
        'forall',
        'exists',
        'not',
        'implies',
        'or',
        'xor',
        'iff',
        'and',
        'mod',
    ],

    operators: ['->', '<->', '|', '&', '=', '!=', '<', '>', '<=', '>=', '%', '+', '-', '*', '/', '|=>', '!'],

    system: ['sysvar', 'sys', 'output', 'guarantee', 'gar'],

    environment: ['envvar', 'env', 'input', 'in', 'assumption', 'asm'],

    reg: ['regexp', 'regtest'],

    brackets: [
        { open: '(', close: ')', token: 'delimiter.parenthesis' },
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.square' },
    ],

    // we include these common regular expressions
    symbols: /([\.\.])|([=&gt;&lt;!:\&amp;\|\+\-\*\/,;]+)/,

    // C# style strings
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    // The main tokenizer for our languages
    tokenizer: {
        root: [
            // Add rule for system keywords
            [/(sysvar|sys|output|guarantee|gar)\b/, 'system'],

            // Add rule for environment keywords
            [/(envvar|env|input|in|assumption|asm)\b/, 'environment'],

            // Add rule for environment keywords
            [/(regexp|regtest)\b/, 'reg'],

            // operators
            // [/@symbols/, { cases: { '@operators': 'keyword' } }],

            // identifiers and keywords
            [
                /[a-zA-Z_][\w$]*/,
                {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'identifier',
                    },
                },
            ],
            [/[A-Z][\w\$]*/, 'type.identifier'],

            // whitespace
            { include: '@whitespace' },
            // comments
            [/\/\*/, 'comment', '@comment'],
            [/\/\/.*$/, 'comment'],
            [/\s*--.*$/, 'comment'],

            // delimiters and operators
            [/[{}()\[\]]/, '@brackets'],
            [
                /@symbols/,
                {
                    cases: {
                        '@operators': 'predefined.operator',
                        '@default': 'operator',
                    },
                },
            ],

            // numbers
            [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/#[xX][0-9a-fA-F]+/, 'number.hex'],
            [/#b[0-1]+/, 'number.binary'],
            [/\d+/, 'number'],

            // delimiter: after number because of .\d floats
            [/[,.]/, 'delimiter'],

            // strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-teminated string
            [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],

            // user values
            [/\{/, { token: 'string.curly', bracket: '@open', next: '@uservalue' }],
            [/(sysvar|sys)\b/, 'system'],
        ],
        comment: [
            [/[^\/*]+/, 'comment'],
            [/\/\*/, 'comment', '@push'], // nested comment
            ['\\*/', 'comment', '@pop'],
            [/[\/*]/, 'comment'],
        ],
        uservalue: [
            [/[^\\\}]+/, 'string'],
            [/\}/, { token: 'string.curly', bracket: '@close', next: '@pop' }],
            [/\\\}/, 'string.escape'],
            [/./, 'string'], // recover
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

export { spectraConf, spectraLang };
