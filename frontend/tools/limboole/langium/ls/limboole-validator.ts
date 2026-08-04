import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { LimbooleAstType, Expr, And, Or, Implies, Iff } from './generated/ast.js';
import { isAnd, isOr, isIff, isImplies, isExpr } from './generated/ast.js';
import type { LimbooleServices } from './limboole-module.js';
import { checkTypo } from './typo-detector.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: LimbooleServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.LimbooleValidator;
  const checks: ValidationChecks<LimbooleAstType> = {
    Expr: [validator.operatorShouldBeBetweenOperands, validator.validateSpelling],
  };
  registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class LimbooleValidator {

  services: LimbooleServices;

  constructor(services: LimbooleServices) {
    this.services = services;
  }

  operatorShouldBeBetweenOperands(expr: Expr, accept: ValidationAcceptor): void {
    if (isAnd(expr) || isOr(expr) || isIff(expr) || isImplies(expr)) {
      validateBinaryOperands(expr, accept, expr.$type);
    }
  }

  validateSpelling(expr: Expr, accept: ValidationAcceptor): void {
    if (isExpr(expr) && expr.var !== undefined) {
      const typo = checkTypo(expr.var, this.services);
      if (typo !== undefined) {
        accept('hint', `A possible typo was detected. Do you mean: "${typo}"?`, { node: expr, property: 'var', code: 'typo', data: { typo } });
      }
    }
  }
}


function validateBinaryOperands(
  expr: And | Or | Iff | Implies,
  accept: ValidationAcceptor,
  operatorName: string
): void {
  if (!expr.left) {
    accept('error', `Left operand is missing for the ${operatorName} operator.`, {
      node: expr,
      property: 'left',
    });
  }
  if (!expr.right) {
    accept('warning', `Right operand is missing for the ${operatorName} operator.`, {
      node: expr,
      property: 'right',
    });
  }
}