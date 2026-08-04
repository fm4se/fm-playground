import {
    AstUtils,
    type ValidationAcceptor,
    type ValidationChecks
} from 'langium';
import type { SpectraServices } from './spectra-module.js';
import {
    SpectraAstType,
    Model,
    isTemporalPrimaryExpr,
    TemporalPrimaryExpr
} from './generated/ast.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: SpectraServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.SpectraValidator;
    const checks: ValidationChecks<SpectraAstType> = {
        Model: validator.checkDwyerPatternsImport,
    };
    registry.register(checks, validator);
}

const dwyerPatternNames = new Set([
    'P_is_false_globally',
    'P_is_false_before_R',
    'P_is_false_after_Q',
    'P_is_false_between_Q_and_R',
    'P_is_false_after_Q_until_R',
    'P_becomes_true_globally',
    'P_becomes_true_before_R',
    'P_becomes_true_After_Q',
    'P_becomes_true_between_Q_and_R',
    'P_becomes_true_after_Q_until_R',
    'P_occures_at_most_twice_globally',
    'P_occures_at_most_twice_before_R',
    'P_occures_at_most_twice_after_Q',
    'P_occures_at_most_twice_between_Q_and_R',
    'P_is_true_globally',
    'P_is_true_before_R',
    'P_is_true_after_Q',
    'P_is_true_between_Q_and_R',
    'P_is_true_After_Q_until_R',
    'S_precedes_to_P_globally',
    'S_precedes_to_P_before_R',
    'S_precedes_to_P_between_Q_and_R',
    'S_precedes_to_P_after_Q_until_R',
    'S_responds_to_P_globally',
    'S_responds_to_P_before_R',
    'S_responds_to_P_after_Q',
    'S_responds_to_P_between_Q_and_R',
    'S_responds_to_P_after_Q_until_R',
    'S_and_T_precedes_to_P_globally',
    'S_and_T_precedes_to_P_before_R',
    'S_and_T_precedes_to_P_after_Q',
    'S_and_T_precedes_to_P_between_Q_and_R',
    'S_and_T_precedes_to_P_after_Q_until_R',
    'P_precedes_S_and_T_globally',
    'P_precedes_S_and_T_before_R',
    'P_precedes_S_and_T_after_q',
    'P_precedes_S_and_T_between_q_and_R',
    'P_precedes_S_and_T_after_q_until_R',
    'P_responds_to_S_and_T_globally',
    'P_responds_to_S_and_T_before_r',
    'P_responds_to_S_and_T_after_Q',
    'P_responds_to_S_and_T_between_Q_and_R',
    'P_responds_to_S_and_T_after_Q_until_R',
    'S_and_T_responds_to_P_globally',
    'S_and_T_responds_to_P_before_R',
    'S_and_T_responds_to_P_after_q',
    'S_and_T_responds_to_P_between_q_and_R',
    'S_and_T_without_Z_responds_to_P_globally',
    'S_and_T_without_Z_responds_to_P_before_R',
    'S_and_T_without_Z_responds_to_P_after_Q',
    'S_and_T_without_Z_responds_to_P_between_Q_and_R',
    'notP_globally',
    'notP_beforeR',
    'pattern03',
    'pattern04',
    'pattern05',
    'pattern06',
    'pattern07',
    'pattern08',
    'pBecomesTrue_betweenQandR',
    'pattern10',
    'pattern11',
    'pattern12',
    'pattern13',
    'pattern14',
    'pattern16',
    'pattern17',
    'pattern18',
    'pattern19',
    'pHolds_afterQuntilR',
    'pattern21',
    'pattern22',
    'pattern24',
    'pattern25',
    'pRespondsToS',
    'pattern27',
    'pattern28',
    'pattern29',
    'pattern30',
    'pattern31',
    'pattern32',
    'pattern33',
    'pattern34',
    'pattern35',
    'pattern36',
    'pattern37',
    'pattern38',
    'pattern39',
    'pattern40',
    'pattern41',
    'pattern42',
    'pattern43',
    'pattern44',
    'pattern45',
    'pattern46',
    'pattern47',
    'pattern48',
    'pattern49',
    'pattern51',
    'pattern52',
    'pattern53',
    'pattern54'
]);

/**
 * Implementation of custom validations.
 */
export class SpectraValidator {

    checkDwyerPatternsImport(model: Model, accept: ValidationAcceptor): void {
        let firstOffendingCall: TemporalPrimaryExpr | undefined = undefined;
        let usesDwyerPatterns = false;

        for (const node of AstUtils.streamAllContents(model)) {
            if (isTemporalPrimaryExpr(node) && node.predPatt?.$refText) {
                if (dwyerPatternNames.has(node.predPatt.$refText)) {
                    usesDwyerPatterns = true;
                    if (!firstOffendingCall) {
                        firstOffendingCall = node;
                    }
                }
            }
        }

        if (usesDwyerPatterns) {
            const hasDwyerImport = model.imports.some(imp => {
                const importString = (imp as any).strValue || imp.$cstNode?.text;
                return importString.includes('DwyerPatterns.spectra') || importString.includes('DwyerPatterns');
            });

            if (!hasDwyerImport && firstOffendingCall) {
                accept('warning',
                    'Dwyer patterns are used but "DwyerPatterns.spectra" is not imported.',
                    {
                        node: firstOffendingCall,
                        property: 'predPatt',
                        code: 'ImportError'
                    }
                );
            }
        }
    }
}

