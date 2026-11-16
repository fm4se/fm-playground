import { DefaultValueConverter, type CstNode, type GrammarAST, type ValueType } from 'langium';

/**
 * Converts Alloy number literals. Alloy allows '_' as a digit separator in decimal,
 * hexadecimal (0x...) and binary (0b...) literals, which the default converter does not handle.
 * Also strips the trailing ':' from command labels ("l: run p").
 */
export class AlloyValueConverter extends DefaultValueConverter {

    protected override runConverter(rule: GrammarAST.AbstractRule, input: string, cstNode: CstNode): ValueType {
        switch (rule.name) {
            case 'INT':
                return parseInt(input.replace(/_/g, ''), 10);
            case 'HEX_INT':
                return parseInt(input.slice(2).replace(/_/g, ''), 16);
            case 'BIN_INT':
                return parseInt(input.slice(2).replace(/_/g, ''), 2);
            case 'CMD_LABEL':
                return input.replace(/\s*:$/, '');
            default:
                return super.runConverter(rule, input, cstNode);
        }
    }
}
