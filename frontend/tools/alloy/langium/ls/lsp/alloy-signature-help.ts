import type { LangiumDocument, MaybePromise } from 'langium';
import type { SignatureHelpProvider } from 'langium/lsp';
import type { ParameterInformation, SignatureHelp, SignatureHelpOptions, SignatureHelpParams, SignatureInformation } from 'vscode-languageserver';
import type { AlloyModule, FunDecl, PredDecl } from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';
import { textOf } from '../typing/type-checker.js';
import { AlloyDescriber, callableSignature, parameterLabels } from './describe.js';

/**
 * Shows the parameters of the predicate or function whose argument list ("p[a, b]")
 * encloses the cursor. A receiver ("x.p[b]") counts as the first argument.
 */
export class AlloySignatureHelpProvider implements SignatureHelpProvider {

    protected readonly describer: AlloyDescriber;

    constructor(protected readonly services: AlloyServices) {
        this.describer = new AlloyDescriber(services);
    }

    get signatureHelpOptions(): SignatureHelpOptions {
        return { triggerCharacters: ['['], retriggerCharacters: [','] };
    }

    provideSignatureHelp(document: LangiumDocument, params: SignatureHelpParams): MaybePromise<SignatureHelp | undefined> {
        const text = document.textDocument.getText();
        const call = findEnclosingCall(text, document.textDocument.offsetAt(params.position));
        if (!call) return undefined;
        const name = call.name.split('/').pop()!;
        const callables = this.services.typing.TypeChecker.callablesNamed(document.parseResult.value as AlloyModule, name);
        if (callables.length === 0) return undefined;
        const argIndex = call.argIndex + (call.receiver ? 1 : 0);
        const signatures = callables.map(c => this.signature(c));
        const active = signatures.findIndex(s => (s.parameters?.length ?? 0) > argIndex);
        return { signatures, activeSignature: Math.max(0, active), activeParameter: argIndex };
    }

    protected signature(callable: PredDecl | FunDecl): SignatureInformation {
        const label = callableSignature(callable);
        const names = [...(callable.qualifier ? [`this: ${textOf(callable.qualifier)}`] : []), ...parameterLabels(callable)];
        const parameters: ParameterInformation[] = [];
        let from = label.indexOf('[');
        for (const param of names) {
            const start = param.startsWith('this:') ? label.indexOf(' ') + 1 : label.indexOf(param, from);
            const end = param.startsWith('this:') ? label.indexOf('.') : start + param.length;
            parameters.push({ label: [start, end] });
            if (!param.startsWith('this:')) from = end;
        }
        const documentation = this.describer.describe(callable)?.documentation;
        return { label, parameters, documentation: documentation ? { kind: 'markdown', value: documentation } : undefined };
    }
}

interface EnclosingCall {
    name: string;
    argIndex: number;
    receiver: boolean;
}

/** Finds the unmatched "[" before the offset, the name before it and the index of the current argument. */
export function findEnclosingCall(text: string, offset: number): EnclosingCall | undefined {
    let depth = 0;
    let argIndex = 0;
    for (let i = offset - 1; i >= 0; i--) {
        const c = text[i];
        if (c === ']' || c === ')' || c === '}') depth++;
        else if (c === '(' || c === '{') {
            if (depth === 0) return undefined;
            depth--;
        } else if (c === '[') {
            if (depth > 0) {
                depth--;
                continue;
            }
            const before = text.slice(0, i).replace(/\s+$/, '');
            const match = /([A-Za-z_À-￿][\w"À-￿]*(?:\/[A-Za-z_À-￿][\w"À-￿]*)*)$/.exec(before);
            if (!match) return undefined;
            const prefix = before.slice(0, before.length - match[1].length).replace(/\s+$/, '');
            return { name: match[1], argIndex, receiver: prefix.endsWith('.') };
        } else if (c === ',' && depth === 0) {
            argIndex++;
        }
    }
    return undefined;
}
