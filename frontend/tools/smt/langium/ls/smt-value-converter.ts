import { DefaultValueConverter, type CstNode, type GrammarAST, type ValueType } from 'langium';

/**
 * Converts SMT-LIB lexical values:
 *  - quoted symbols `|abc|` denote the same symbol as `abc`, so the bars are removed;
 *  - string literals use `""` as the only escape sequence (SMT-LIB 2.5+);
 *  - numerals are kept as strings to avoid precision loss on large values.
 */
export class SmtValueConverter extends DefaultValueConverter {

    protected override runConverter(rule: GrammarAST.AbstractRule, input: string, cstNode: CstNode): ValueType {
        switch (rule.name) {
            case 'QUOTED_SYMBOL':
                return unquoteSymbol(input);
            case 'STRING':
                return input.length >= 2 ? input.slice(1, -1).replace(/""/g, '"') : input;
            case 'NUMERAL':
            case 'DECIMAL':
            case 'HEXADECIMAL':
            case 'BINARY':
                return input;
            default:
                return super.runConverter(rule, input, cstNode);
        }
    }
}

export function unquoteSymbol(text: string): string {
    return text.length >= 2 && text.startsWith('|') && text.endsWith('|') ? text.slice(1, -1) : text;
}
