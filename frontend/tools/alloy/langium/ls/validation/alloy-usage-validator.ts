import type { ValidationAcceptor } from 'langium';
import type { SigDecl, AdditionalSig } from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';
import type { References } from 'langium';

export class AlloyUsageValidator {
    protected readonly references: References;

    constructor(services: AlloyServices) {
        this.references = services.references.References;
    }

    checkUnusedSignature(sig: SigDecl, accept: ValidationAcceptor): void {
        if (sig.name) {
            const refs = this.references.findReferences(sig, { includeDeclaration: false });
            if (refs.isEmpty()) {
                accept('warning', `Signature ${sig.name} is never used.`, {
                    node: sig,
                    property: 'name'
                });
            }
        }
    }

    checkUnusedAdditionalSignature(sig: AdditionalSig, accept: ValidationAcceptor): void {
        if (sig.name) {
            const refs = this.references.findReferences(sig, { includeDeclaration: false });
            if (refs.isEmpty()) {
                accept('warning', `Signature ${sig.name} is never used.`, {
                    node: sig,
                    property: 'name'
                });
            }
        }
    }
}
