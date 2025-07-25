// Monarch syntax highlighting for the spectra language.
export default {
    keywords: [
        '.all',
        '.any',
        '.max',
        '.min',
        '.prod',
        '.sum',
        'FALSE',
        'G',
        'GE',
        'GEF',
        'GF',
        'H',
        'HISTORICALLY',
        'Int',
        'O',
        'ONCE',
        'PREV',
        'S',
        'SINCE',
        'T',
        'TRIGGERED',
        'TRUE',
        'Y',
        'alw',
        'alwEv',
        'always',
        'alwaysEventually',
        'and',
        'aux',
        'auxvar',
        'boolean',
        'counter',
        'dec:',
        'define',
        'exists',
        'false',
        'forall',
        'iff',
        'implies',
        'import',
        'ini',
        'initially',
        'keep',
        'mod',
        'module',
        'modulo',
        'monitor',
        'next',
        'not',
        'or',
        'out',
        'overflow:',
        'pattern',
        'predicate',
        'spec',
        'trans',
        'trig',
        'true',
        'type',
        'underflow:',
        'var',
        'weight',
        'xor',
    ],
    systemKeywords: ['sysvar', 'sys', 'output', 'guarantee', 'gar'],
    environmentKeywords: ['envvar', 'env', 'input', 'in', 'assumption', 'asm'],
    regexKeywords: ['regexp', 'regtest'],
    operators: [
        '!',
        '!=',
        '%',
        '&',
        '*',
        '+',
        ',',
        '-',
        '->',
        '.',
        '..',
        '/',
        ':',
        ':=',
        ';',
        '<',
        '<->',
        '<=',
        '=',
        '>',
        '>=',
        '?',
        '|',
        '|=>',
        '~',
    ],
    symbols: /!|!=|%|&|\(|\(\)|\)|\*|\+|,|-|->|\.|\.\.|\/|:|:=|;|<|<->|<=|=|>|>=|\?|\[|\]|\{|\||\|=>|\}|~/,
    tokenizer: {
        initial: [
            {
                regex: /(\^?(([a-z]|[A-Z])|_)((([a-z]|[A-Z])|_)|[0-9])*)/,
                action: {
                    cases: {
                        '@systemKeywords': { token: 'system' },
                        '@environmentKeywords': { token: 'environment' },
                        '@regexKeywords': { token: 'reg' },
                        '@keywords': { token: 'keyword' },
                        '@default': { token: 'string' },
                    },
                },
            },
            { regex: /[0-9]+/, action: { token: 'number' } },
            { regex: /("((\\(((("|\\)|n)|r)|t))|((?!(\\|"))[\s\S]*?))*")/, action: { token: 'string' } },
            { include: '@whitespace' },
            {
                regex: /@symbols/,
                action: { cases: { '@operators': { token: 'operator' }, '@default': { token: '' } } },
            },
        ],
        whitespace: [
            { regex: /\/\*/, action: { token: 'comment', next: '@comment' } },
            { regex: /\/\/[^\n\r]*|--[^\n\r]*/, action: { token: 'comment' } },
            { regex: /((( |	)|\r)|\n)+/, action: { token: 'white' } },
        ],
        comment: [
            { regex: /[^/\*]+/, action: { token: 'comment' } },
            { regex: /\*\//, action: { token: 'comment', next: '@pop' } },
            { regex: /[/\*]/, action: { token: 'comment' } },
        ],
    },
};
