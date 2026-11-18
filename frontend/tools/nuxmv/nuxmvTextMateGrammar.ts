import type * as monaco from 'monaco-editor';

const nuxmvConf: monaco.languages.LanguageConfiguration = {
    comments: {
        lineComment: '--',
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

const nuxmvLang: monaco.languages.IMonarchLanguage = {
    keywords: [
        '@F~',
        '@O~',
        'A',
        'ABF',
        'ABG',
        'abs',
        'AF',
        'AG',
        'array',
        'ASSIGN',
        'at next',
        'at last',
        'AX, bool',
        'boolean',
        'BU',
        'case',
        'Clock',
        'clock',
        'COMPASSION',
        'COMPID',
        'COMPUTE',
        'COMPWFF',
        'CONSTANTS',
        'CONSTARRAY',
        'CONSTRAINT',
        'cos',
        'count',
        'CTLSPEC',
        'CTLWFF',
        'DEFINE',
        'E',
        'EBF',
        'EBG',
        'EF',
        'EG',
        'esac',
        'EX',
        'exp',
        'extend',
        'F',
        'FAIRNESS',
        'FALSE',
        'floor',
        'FROZENVAR',
        'FUN',
        'G',
        'H',
        'IN',
        'in',
        'INIT',
        'init',
        'Integer',
        'integer',
        'INVAR',
        'INVARSPEC',
        'ISA',
        'ITYPE',
        'IVAR',
        'JUSTICE',
        'ln',
        'LTLSPEC',
        'LTLWFF',
        'MAX',
        'max',
        'MDEFINE',
        'MIN',
        'min',
        'MIRROR',
        'mod',
        'MODULE',
        'NAME',
        'next',
        'NEXTWFF',
        'noncontinuous',
        'O',
        'of',
        'PRED',
        'PREDICATES',
        'pi',
        'pow',
        'PSLSPEC',
        'PARSYNTH',
        'READ',
        'Real',
        'real',
        'resize',
        'S',
        'SAT',
        'self',
        'signed',
        'SIMPWFF',
        'sin',
        'sizeof',
        'SPEC',
        'swconst',
        'T',
        'tan',
        'time',
        'time since',
        'time until',
        'toint',
        'TRANS',
        'TRUE',
        'typeof',
        'U',
        'union',
        'unsigned',
        'URGENT',
        'uwconst',
        'V',
        'VALID',
        'VAR',
        'Word',
        'word',
        'word1',
        'WRITE',
        'X',
        'xnor',
        'xor',
        'X~ Y',
        'Y~',
        'Z',
    ],

    operators: ['=', '>', '<', '<=', '>=', '!='],

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
            [/\/\--/, 'comment', '@push'], // nested comments
            ['\\/', 'comment', '@pop'],
            [/[\/*]/, 'comment'],
        ],

        string: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
        ],

        whitespace: [
            [/[ \t\v\f\r\n]+/, 'white'],
            [/\/\--/, 'comment', '@comment'],
            [/\s*--.*$/, 'comment'],
        ],
    },
};

export { nuxmvConf, nuxmvLang };
