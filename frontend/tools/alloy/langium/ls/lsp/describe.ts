import { AstUtils, type AstNode } from 'langium';
import {
    isAdditionalSig, isAssertDecl, isCmdDecl, isDeclName, isEnumDecl, isEnumValue, isFactDecl, isFieldDecl, isFunDecl, isLetDecl,
    isMacroDecl, isMacroParam, isModuleParam, isParaDecls, isPredDecl, isQuantExpr, isSetExpr, isSigDecl,
    type Decl, type FunDecl, type PredDecl, type SigDecl
} from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';
import { textOf } from '../typing/type-checker.js';

export interface Description {
    /** Alloy source of the declaration, e.g. "pred show[p: Person]". */
    signature: string;
    /** The relational type, e.g. "{this/Person->this/Name}". */
    type?: string;
    /** Documentation comment written above the declaration. */
    documentation?: string;
}

/** Describes declarations for hover and signature help. */
export class AlloyDescriber {

    constructor(protected readonly services: AlloyServices) { }

    describe(node: AstNode): Description | undefined {
        const signature = this.signatureOf(node);
        if (!signature) return undefined;
        return { signature, type: this.typeOf(node), documentation: leadingComment(declarationNode(node)) };
    }

    protected typeOf(node: AstNode): string | undefined {
        if (isPredDecl(node) || isFactDecl(node) || isAssertDecl(node) || isMacroDecl(node) || isMacroParam(node) || isCmdDecl(node)) return undefined;
        const checker = this.services.typing.TypeChecker;
        const type = checker.declaredType(node);
        return type.isUnknown ? undefined : checker.analyze(AstUtils.getDocument(node)).format(type);
    }

    signatureOf(node: AstNode): string | undefined {
        if (isSigDecl(node) || isAdditionalSig(node)) {
            const decl: SigDecl = isAdditionalSig(node) ? node.$container : node;
            const qualifiers = decl.qualifiers.length > 0 ? decl.qualifiers.join(' ') + ' ' : '';
            const ext = decl.sigExt ? ' ' + textOf(decl.sigExt) : '';
            return `${qualifiers}sig ${node.name}${ext}`;
        }
        if (isDeclName(node)) {
            const decl = node.$container;
            const owner = decl.$container;
            const bound = boundText(decl);
            if (isFieldDecl(owner)) {
                const modifiers = (owner.var ? 'var ' : '') + (owner.private ? 'private ' : '');
                return `${modifiers}${node.name}${bound}    (field of sig ${owner.$container.name})`;
            }
            if (isParaDecls(owner)) return `${node.name}${bound}    (parameter of ${owner.$container.name})`;
            if (isQuantExpr(owner)) return `${owner.quant} ${node.name}${bound}`;
            if (isSetExpr(owner)) return `{${node.name}${bound} | ...}`;
            return `${node.name}${bound}`;
        }
        if (isLetDecl(node)) return `let ${node.name} = ${textOf(node.expr)}`;
        if (isPredDecl(node) || isFunDecl(node)) return callableSignature(node);
        if (isFactDecl(node)) return `fact ${node.name ?? ''}`.trim();
        if (isAssertDecl(node)) return `assert ${node.name ?? ''}`.trim();
        if (isEnumDecl(node)) return `enum ${node.name} { ${node.values.map(v => v.name).join(', ')} }`;
        if (isEnumValue(node)) return `${node.name}    (value of enum ${node.$container.name})`;
        if (isMacroDecl(node)) return `let ${node.name}${node.params.length > 0 ? `[${node.params.map(p => p.name).join(', ')}]` : ''}`;
        if (isMacroParam(node)) return `${node.name}    (parameter of macro ${node.$container.name})`;
        if (isModuleParam(node)) return `${node.exactly ? 'exactly ' : ''}${node.name}    (module parameter)`;
        if (isCmdDecl(node)) return `${node.name}: ${node.kind}`;
        return undefined;
    }
}

/** "pred show[p: Person]" or "fun Book.lookup[n: Name]: set Addr" */
export function callableSignature(callable: PredDecl | FunDecl): string {
    const receiver = callable.qualifier ? textOf(callable.qualifier) + '.' : '';
    const params = callable.paraDecls ? `[${parameterLabels(callable).join(', ')}]` : '';
    const result = isFunDecl(callable) ? `: ${textOf(callable.returnType)}` : '';
    return `${isPredDecl(callable) ? 'pred' : 'fun'} ${receiver}${callable.name}${params}${result}`;
}

/** One label per declared parameter name, e.g. ["a: Person", "b: Person"]. */
export function parameterLabels(callable: PredDecl | FunDecl): string[] {
    return (callable.paraDecls?.decls ?? []).flatMap(decl => decl.names.map(name => `${name.name}${boundText(decl)}`));
}

function boundText(decl: Decl): string {
    return `${decl.defined ? ' = ' : ': '}${decl.disjExpr ? 'disj ' : ''}${textOf(decl.expr)}`;
}

/** The node whose preceding comment documents the declaration (e.g. the field declaration of a field name). */
function declarationNode(node: AstNode): AstNode {
    if (isAdditionalSig(node)) return node.$container;
    if (isDeclName(node) && isFieldDecl(node.$container.$container)) return node.$container.$container;
    return node;
}

/**
 * The comment directly above a declaration: a block comment or consecutive line comments
 * (// or --), with comment markers removed.
 */
export function leadingComment(node: AstNode): string | undefined {
    const cst = node.$cstNode;
    if (!cst) return undefined;
    const text = AstUtils.getDocument(node).textDocument.getText();
    let end = cst.offset;
    while (end > 0 && /[ \t]/.test(text[end - 1])) end--;
    const before = text.slice(0, end).replace(/\s+$/, '');
    if (before.length === 0) return undefined;
    // Only accept a comment that ends on the line just above the declaration (or on the same line).
    const gap = text.slice(before.length, end);
    if ((gap.match(/\n/g) ?? []).length > 1) return undefined;
    if (before.endsWith('*/')) {
        const start = before.lastIndexOf('/*');
        if (start < 0) return undefined;
        return cleanBlockComment(before.slice(start));
    }
    const lines = before.split(/\r?\n/);
    const comments: string[] = [];
    for (let i = lines.length - 1; i >= 0; i--) {
        const match = /^\s*(\/\/|--)(.*)$/.exec(lines[i]);
        if (!match) break;
        comments.unshift(match[2].trim());
    }
    const result = comments.join('\n').trim();
    return result.length > 0 ? result : undefined;
}

function cleanBlockComment(comment: string): string | undefined {
    const body = comment.replace(/^\/\*+/, '').replace(/\*+\/$/, '');
    const lines = body.split(/\r?\n/).map(line => line.replace(/^\s*\*?\s?/, '').trimEnd());
    const result = lines.join('\n').trim();
    return result.length > 0 ? result : undefined;
}
