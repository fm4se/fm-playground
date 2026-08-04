import type { ValidationChecks } from 'langium';
import type { AlloyAstType } from './generated/ast.js';
import type { AlloyServices } from './alloy-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: AlloyServices) {
    const registry = services.validation.ValidationRegistry;
    
    // Get modular validators from DI
    const usageValidator = services.validation.AlloyUsageValidator;
    const nameValidator = services.validation.AlloyNameValidator;

    // Register usage checks
    const usageChecks: ValidationChecks<AlloyAstType> = {
        SigDecl: usageValidator.checkUnusedSignature,
        AdditionalSig: usageValidator.checkUnusedAdditionalSignature
    };
    registry.register(usageChecks, usageValidator);

    // Register naming checks
    const nameChecks: ValidationChecks<AlloyAstType> = {
        AlloyModule: nameValidator.checkDuplicateNames,
        SigDecl: nameValidator.checkDuplicateFields,
        ParaDecls: nameValidator.checkDuplicateParameters
    };
    registry.register(nameChecks, nameValidator);
}
