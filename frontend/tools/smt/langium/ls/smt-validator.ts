import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { SmtAstType, UnknownCommand } from './generated/ast.js';
import type { SmtServices } from './smt-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: SmtServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.SmtValidator;
    const checks: ValidationChecks<SmtAstType> = {
        UnknownCommand: validator.checkUnknownCommand
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class SmtValidator {

    checkUnknownCommand(cmd: UnknownCommand, accept: ValidationAcceptor): void {
        accept('error', `Unknown command '${cmd.name}'.`, { node: cmd, property: 'name' });
    }

}
