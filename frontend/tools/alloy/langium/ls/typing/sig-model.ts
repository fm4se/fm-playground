/**
 * The signature hierarchy of Alloy modules: which primitive signature each sig declares,
 * and the type of every signature (subset signatures have the union of their parents'
 * types). Results are cached for the whole workspace, because a sig may extend a sig of
 * an imported module.
 */
import { AstUtils, WorkspaceCache, type AstNode } from 'langium';
import {
    isAdditionalSig, isEnumDecl, isEnumValue, isModuleDecl, isModuleParam, isSigDecl,
    type AdditionalSig, type EnumDecl, type EnumValue, type ModuleParam, type QualName, type SigDecl
} from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';
import { AlloyType, INT, NONE, PrimSig, STRING, UNIV } from './alloy-types.js';

/** Nodes that declare a signature. */
export type SigNode = SigDecl | AdditionalSig | EnumDecl | EnumValue;

export function isSigNode(node: unknown): node is SigNode {
    return isSigDecl(node) || isAdditionalSig(node) || isEnumDecl(node) || isEnumValue(node);
}

export interface SigProblem {
    node: AstNode;
    property?: string;
    index?: number;
    message: string;
}

export interface SigInfo {
    /** The primitive signature; undefined for subset signatures. */
    prim?: PrimSig;
    /** The type of the signature. */
    type: AlloyType;
    /** Direct parents (the extended sig, or the sigs of an "in"/"=" declaration). */
    parents: SigNode[];
    /** Problems with the declaration, reported on the sig's own document. */
    problems: SigProblem[];
}

/** Builtin names usable as signatures (and in sig declarations). */
const BUILTIN_SIGS: Record<string, AlloyType> = {
    'univ': AlloyType.unary(UNIV),
    'Int': AlloyType.unary(INT),
    'seq/Int': AlloyType.unary(INT),
    'String': AlloyType.unary(STRING),
    'none': AlloyType.unary(NONE),
};

/** The full name of a reference to a builtin, e.g. "seq/Int". */
export function qualifiedText(name: QualName): string {
    return [...name.names, name.ref.$refText].join('/');
}

/** True if the reference resolves to nothing or to a builtin (builtins resolve to the module root). */
export function isBuiltinReference(name: QualName): boolean {
    const target = name.ref.ref;
    return !target || target.$container === undefined;
}

/** The path of the module a node belongs to, or undefined for a module without a module declaration. */
export function modulePathOf(node: AstNode): string | undefined {
    const root = AstUtils.findRootNode(node);
    return isModuleDecl(root) ? [...root.qualName.names, root.qualName.name].join('/') : undefined;
}

/** Returned for a sig that is reached again while its own parents are computed. */
const CYCLE: SigInfo = { type: AlloyType.UNKNOWN, parents: [], problems: [] };

export class AlloySigModel {

    protected readonly cache: WorkspaceCache<AstNode, SigInfo>;
    protected readonly inProgress = new Set<AstNode>();

    constructor(services: AlloyServices) {
        this.cache = new WorkspaceCache(services.shared);
    }

    /** Information about a signature declaration. */
    info(node: SigNode): SigInfo {
        const cached = this.cache.get(node);
        if (cached) return cached;
        if (this.inProgress.has(node)) return CYCLE;
        this.inProgress.add(node);
        try {
            const info = this.compute(node);
            this.cache.set(node, info);
            return info;
        } finally {
            this.inProgress.delete(node);
        }
    }

    /** The primitive signature standing for a module parameter. */
    paramSig(param: ModuleParam): PrimSig {
        const cached = this.cache.get(param);
        if (cached?.prim) return cached.prim;
        const prim = new PrimSig(param.name, UNIV, param, modulePathOf(param), true);
        this.cache.set(param, { prim, type: AlloyType.unary(prim), parents: [], problems: [] });
        return prim;
    }

    /** The type denoted by a reference used as a sig (sig parents, scopes); undefined if it is not a sig. */
    typeOfSigReference(name: QualName): AlloyType | undefined {
        const target = name.ref.ref;
        if (isBuiltinReference(name)) {
            return target ? BUILTIN_SIGS[qualifiedText(name)] : AlloyType.UNKNOWN;
        }
        if (isSigNode(target)) return this.info(target).type;
        if (isModuleParam(target)) return AlloyType.unary(this.paramSig(target));
        return undefined;
    }

    /** True if `sig` is `ancestor` or (transitively) extends or is a subset of it. */
    isSameOrDescendant(sig: SigNode, ancestor: SigNode): boolean {
        const seen = new Set<SigNode>();
        const visit = (s: SigNode): boolean => {
            if (s === ancestor) return true;
            if (seen.has(s)) return false;
            seen.add(s);
            return this.info(s).parents.some(visit);
        };
        return visit(sig);
    }

    protected compute(node: SigNode): SigInfo {
        const modulePath = modulePathOf(node);
        if (isEnumDecl(node)) {
            const prim = new PrimSig(node.name, UNIV, node, modulePath);
            return { prim, type: AlloyType.unary(prim), parents: [], problems: [] };
        }
        if (isEnumValue(node)) {
            const parent = this.info(node.$container).prim ?? UNIV;
            const prim = new PrimSig(node.name, parent, node, modulePath);
            return { prim, type: AlloyType.unary(prim), parents: [node.$container], problems: [] };
        }
        const decl = isAdditionalSig(node) ? node.$container : node;
        const ext = decl.sigExt;
        const problems: SigProblem[] = [];
        const parents: SigNode[] = [];

        if (ext && ext.keyword !== 'extends') {
            // Subset signature: the union of its parents.
            if (decl.qualifiers.includes('abstract')) {
                problems.push({ node: decl, property: 'qualifiers', index: decl.qualifiers.indexOf('abstract'), message: 'Subset signature cannot be abstract.' });
            }
            let type = AlloyType.EMPTY;
            for (const parentName of [ext.parent, ...ext.additionalParents]) {
                const parentType = this.parentType(parentName, node, parents, problems);
                type = type.isUnknown || parentType.isUnknown ? AlloyType.UNKNOWN : type.merge(parentType);
            }
            return { type, parents, problems };
        }

        let parent = UNIV;
        if (ext) {
            const target = ext.parent.ref.ref;
            const text = qualifiedText(ext.parent);
            if (isBuiltinReference(ext.parent)) {
                if (target && text !== 'univ') {
                    problems.push({ node: ext, property: 'parent', message: `sig ${node.name} cannot extend the builtin "${text}" signature` });
                }
            } else if (isSigNode(target)) {
                parents.push(target);
                const parentInfo = this.info(target);
                if (parentInfo === CYCLE) {
                    problems.push({ node: ext, property: 'parent', message: `Sig ${node.name} is involved in a cyclic inheritance.` });
                } else if (parentInfo.prim) {
                    parent = parentInfo.prim;
                } else {
                    problems.push({
                        node: ext, property: 'parent',
                        message: `Cannot extend the subset signature "${text}".\nA signature can only extend a toplevel signature or a subsignature.`
                    });
                }
            } else if (isModuleParam(target)) {
                parent = this.paramSig(target);
            } else if (target) {
                problems.push({ node: ext, property: 'parent', message: `The sig "${text}" cannot be found.` });
            }
        }
        const prim = new PrimSig(node.name, parent, node, modulePath);
        return { prim, type: AlloyType.unary(prim), parents, problems };
    }

    protected parentType(name: QualName, node: SigNode, parents: SigNode[], problems: SigProblem[]): AlloyType {
        const target = name.ref.ref;
        if (isSigNode(target)) {
            parents.push(target);
            const info = this.info(target);
            if (info === CYCLE) {
                problems.push({ node: name, message: `Sig ${node.name} is involved in a cyclic inheritance.` });
            }
            return info.type;
        }
        const type = this.typeOfSigReference(name);
        if (!type) {
            problems.push({ node: name, message: `The sig "${qualifiedText(name)}" cannot be found.` });
            return AlloyType.UNKNOWN;
        }
        return type;
    }
}
