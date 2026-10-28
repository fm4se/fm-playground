import { AstUtils } from 'langium';
import {
    ConstantSymbol,
    DefineBody,
    EnumValue,
    FormalParameter,
    isEnumType,
    isModule,
    Module,
    NuSmvModel,
    VarBody
} from './generated/ast.js';

export type NuSMVSymbol = Module | VarBody | FormalParameter | DefineBody | ConstantSymbol | EnumValue;

export function hasSymbolName<T extends NuSMVSymbol>(symbol: T | undefined): symbol is T {
    return typeof symbol?.name === 'string' && symbol.name.length > 0;
}

export function findContainingModule(node: object): Module | undefined {
    return AstUtils.getContainerOfType(node as never, isModule);
}

export function collectModuleSymbols(module: Module): NuSMVSymbol[] {
    const symbols: NuSMVSymbol[] = [];
    if (hasSymbolName(module)) {
        symbols.push(module);
    }
    symbols.push(...module.params.filter(hasSymbolName));
    for (const element of module.elements) {
        if ('vars' in element && Array.isArray(element.vars)) {
            symbols.push(...element.vars.filter(hasSymbolName));
            for (const variable of element.vars) {
                symbols.push(...collectEnumValues(variable));
            }
        }
        if ('defineBodies' in element && Array.isArray(element.defineBodies)) {
            symbols.push(...element.defineBodies.filter(hasSymbolName));
        }
        if ('constants' in element && Array.isArray(element.constants)) {
            symbols.push(...element.constants.filter(hasSymbolName));
        }
    }
    return symbols;
}

export function collectVisibleModuleSymbols(module: Module): Exclude<NuSMVSymbol, Module>[] {
    return collectModuleSymbols(module).filter((symbol): symbol is Exclude<NuSMVSymbol, Module> => !isModule(symbol));
}

export function collectSymbolNames(module: Module): string[] {
    return [...new Set(collectModuleSymbols(module).map(symbol => symbol.name))];
}

export function collectDeclaredModules(node: object): Module[] {
    const root = AstUtils.getContainerOfType(node as never, (item): item is NuSmvModel => (item as NuSmvModel | undefined)?.$type === 'NuSmvModel')
        ?? ((node as NuSmvModel | undefined)?.$type === 'NuSmvModel' ? node as NuSmvModel : undefined);
    return root?.modules.filter(hasSymbolName) ?? [];
}

function collectEnumValues(variable: VarBody): EnumValue[] {
    return isEnumType(variable.type)
        ? variable.type.values.filter(hasSymbolName)
        : [];
}
