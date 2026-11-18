import type * as monaco from 'monaco-editor';

const smt2Conf: monaco.languages.LanguageConfiguration = {
    comments: {
        lineComment: ';',
    },
    autoClosingPairs: [{ open: '(', close: ')' }],
    brackets: [['(', ')']],
    surroundingPairs: [{ open: '(', close: ')' }],
};

/* SMT2 language definition (borrowed from monaco editor languages) */
const smt2Lang: monaco.languages.IMonarchLanguage = {
    // Set defaultToken to invalid to see what you do not tokenize yet
    // defaultToken: 'invalid',

    keywords: [
        'define-fun',
        'define-const',
        'assert',
        'push',
        'pop',
        'assert',
        'check-sat',
        'declare-const',
        'declare-fun',
        'get-model',
        'get-value',
        'declare-sort',
        'declare-datatypes',
        'reset',
        'eval',
        'set-logic',
        'help',
        'get-assignment',
        'exit',
        'get-proof',
        'get-unsat-core',
        'echo',
        'let',
        'forall',
        'exists',
        'define-sort',
        'set-option',
        'get-option',
        'set-info',
        'check-sat-using',
        'apply',
        'simplify',
        'display',
        'as',
        '!',
        'get-info',
        'declare-map',
        'declare-rel',
        'declare-var',
        'rule',
        'query',
        'get-user-tactics',
    ],

    operators: ['=', '&gt;', '&lt;', '&lt;=', '&gt;=', '=&gt;', '+', '-', '*', '/'],

    builtins: [
        'mod',
        'div',
        'rem',
        '^',
        'to_real',
        'and',
        'or',
        'not',
        'distinct',
        'to_int',
        'is_int',
        '~',
        'xor',
        'if',
        'ite',
        'true',
        'false',
        'root-obj',
        'sat',
        'unsat',
        'const',
        'map',
        'store',
        'select',
        'sat',
        'unsat',
        'bit1',
        'bit0',
        'bvneg',
        'bvadd',
        'bvsub',
        'bvmul',
        'bvsdiv',
        'bvudiv',
        'bvsrem',
        'bvurem',
        'bvsmod',
        'bvule',
        'bvsle',
        'bvuge',
        'bvsge',
        'bvult',
        'bvslt',
        'bvugt',
        'bvsgt',
        'bvand',
        'bvor',
        'bvnot',
        'bvxor',
        'bvnand',
        'bvnor',
        'bvxnor',
        'concat',
        'sign_extend',
        'zero_extend',
        'extract',
        'repeat',
        'bvredor',
        'bvredand',
        'bvcomp',
        'bvshl',
        'bvlshr',
        'bvashr',
        'rotate_left',
        'rotate_right',
        'get-assertions',
    ],

    brackets: [
        { open: '(', close: ')', token: 'delimiter.parenthesis' },
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.square' },
    ],

    // we include these common regular expressions
    symbols: /[=&gt;&lt;~&amp;|+\-*\/%@#]+/,

    // C# style strings
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    // The main tokenizer for our languages
    tokenizer: {
        root: [
            // identifiers and keywords
            [
                /[a-z_][\w\-\.']*/,
                { cases: { '@builtins': 'predefined.identifier', '@keywords': 'keyword', '@default': 'identifier' } },
            ],
            [/[A-Z][\w\-\.']*/, 'type.identifier'],
            [/[:][\w\-\.']*/, 'string.identifier'],
            [/[$?][\w\-\.']*/, 'constructor.identifier'],

            // whitespace
            { include: '@whitespace' },

            // delimiters and operators
            [/[()\[\]]/, '@brackets'],
            [/@symbols/, { cases: { '@operators': 'predefined.operator', '@default': 'operator' } }],

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
            [/;.*$/, 'comment'],
        ],
    },
};

export { smt2Conf, smt2Lang };
