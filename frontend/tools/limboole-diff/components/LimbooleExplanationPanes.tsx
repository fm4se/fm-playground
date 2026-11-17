import type { ReactNode } from 'react';
import { MDBSpinner } from 'mdb-react-ui-kit';
import { TbAlertTriangle, TbCircleCheck, TbInfoCircle } from 'react-icons/tb';
import {
    LimbooleChange,
    LimbooleExplanation,
    LimbooleExplanationEntry,
    LimbooleTerm,
    LimbooleValue,
} from '../limbooleDiffTypes';

interface PaneProps {
    entry: LimbooleExplanationEntry | undefined;
    isExplaining: boolean;
    canExplain: boolean;
}

const Note = ({ kind, children }: { kind: 'ok' | 'warn' | 'info'; children: ReactNode }) => (
    <p className={`smt-diff-note smt-diff-note-${kind}`}>
        {kind === 'ok' ? <TbCircleCheck /> : kind === 'warn' ? <TbAlertTriangle /> : <TbInfoCircle />} {children}
    </p>
);

const Placeholder = ({ isExplaining, canExplain }: { isExplaining: boolean; canExplain: boolean }) => (
    <div className='smt-diff-placeholder'>
        {isExplaining ? (
            <>
                <MDBSpinner size='sm' role='status' /> Computing the explanation…
            </>
        ) : canExplain ? (
            'Click Explain to explain the witness shown in the Output tab.'
        ) : (
            'Explanations are available for the "Not Current But Previous" and "Not Previous But Current" analyses.'
        )}
    </div>
);

/** Colour of a variable that occurs in only one formula (red: previous only, green: current only). */
const variableClass = (explanation: LimbooleExplanation, name: string) =>
    explanation.private_variables.previous.includes(name)
        ? 'smt-diff-define-previous'
        : explanation.private_variables.current.includes(name)
          ? 'smt-diff-define-current'
          : undefined;

const Term = ({ term, explanation }: { term: LimbooleTerm; explanation: LimbooleExplanation }) =>
    term.literals.length === 0 ? (
        <code className='smt-diff-literal'>true</code>
    ) : (
        <span className='smt-diff-literals'>
            {term.literals.map((literal, index) => (
                <span key={literal.name}>
                    {index > 0 && <span className='smt-diff-and'>and</span>}
                    <code className={`smt-diff-literal ${variableClass(explanation, literal.name) ?? ''}`}>
                        {literal.text}
                    </code>
                </span>
            ))}
        </span>
    );

const Valuation = ({
    values,
    explanation,
    highlight,
}: {
    values: LimbooleValue[];
    explanation: LimbooleExplanation;
    highlight?: Set<string>;
}) => (
    <pre className='smt-diff-smtlib'>
        {values.map(({ name, value }) => (
            <div
                key={name}
                className={`${variableClass(explanation, name) ?? ''} ${highlight?.has(name) ? 'smt-diff-define-highlight' : ''}`}
            >
                {name} = {value}
            </div>
        ))}
    </pre>
);

const Changes = ({ changes, explanation }: { changes: LimbooleChange[]; explanation: LimbooleExplanation }) => (
    <ul className='smt-diff-changes'>
        {changes.map((change) => (
            <li key={change.symbol}>
                <code className={variableClass(explanation, change.symbol)}>{change.symbol}</code>:{' '}
                <code className='smt-diff-before'>{change.before}</code>
                <span className='smt-diff-arrow'>→</span>
                <code className='smt-diff-after'>{change.after}</code>
            </li>
        ))}
    </ul>
);

const AbductiveBody = ({ explanation }: { explanation: LimbooleExplanation }) => {
    const { base, compare, abduction, violated_conjuncts } = explanation;
    const disjoint = abduction.explanation.literals.length === 0;
    return (
        <>
            <h6>Why the {compare} formula rejects this valuation</h6>
            {violated_conjuncts.length > 0 ? (
                <>
                    <p>
                        It falsifies {violated_conjuncts.length === 1 ? 'this conjunct' : 'these conjuncts'} of the{' '}
                        {compare} formula:
                    </p>
                    <ul className='smt-diff-assertions'>
                        {violated_conjuncts.map((conjunct, index) => (
                            <li key={index}>
                                <code>{conjunct}</code>
                            </li>
                        ))}
                    </ul>
                </>
            ) : (
                <p className='smt-diff-muted'>The {compare} formula is false for this valuation.</p>
            )}

            <h6>Abductive explanation</h6>
            {disjoint ? (
                <Note kind='info'>
                    The two formulas have no valuation in common: every valuation of the {base} formula is rejected by
                    the {compare} formula.
                </Note>
            ) : (
                <>
                    <p>
                        These values of the witness suffice: every valuation of the {base} formula with these values is
                        rejected by the {compare} formula, and no value can be dropped.
                    </p>
                    <div className='smt-diff-formula'>
                        <Term term={abduction.explanation} explanation={explanation} />
                    </div>
                </>
            )}

            {!disjoint && (
                <>
                    <h6>The whole difference</h6>
                    <p>
                        {abduction.coverage === 'complete'
                            ? `The valuations of the ${base} formula rejected by the ${compare} formula are exactly those satisfying one of these cases:`
                            : `Valuations of the ${base} formula satisfying any of these cases are rejected by the ${compare} formula:`}
                    </p>
                    <ol className='smt-diff-cases'>
                        {abduction.generalizations.map((term, index) => (
                            <li key={index}>
                                <Term term={term} explanation={explanation} />
                            </li>
                        ))}
                    </ol>
                    {abduction.coverage === 'complete' && (
                        <Note kind='ok'>These cases cover the whole difference.</Note>
                    )}
                    {abduction.coverage === 'limit-reached' && (
                        <Note kind='warn'>
                            The case limit was reached; further differences exist that are not listed
                            {abduction.uncovered_witness && (
                                <>
                                    , for example{' '}
                                    <code>
                                        {abduction.uncovered_witness
                                            .map(({ name, value }) => (value ? name : `!${name}`))
                                            .join(' & ')}
                                    </code>
                                </>
                            )}
                            .
                        </Note>
                    )}
                    {abduction.coverage === 'incomplete' && (
                        <Note kind='warn'>
                            The time budget ran out; these cases may not cover the whole difference.
                        </Note>
                    )}
                    {!abduction.minimal && (
                        <Note kind='info'>Some cases may contain values that are not strictly needed.</Note>
                    )}
                </>
            )}
        </>
    );
};

const CounterfactualBody = ({ explanation }: { explanation: LimbooleExplanation }) => {
    const { counterfactual, compare } = explanation;
    if (counterfactual.status !== 'found' || !counterfactual.model) {
        return <Note kind='info'>The {compare} formula is unsatisfiable, so no valuation can satisfy it.</Note>;
    }
    const changed = new Set(counterfactual.changes.map((change) => change.symbol));
    const count = counterfactual.changes.length;
    return (
        <>
            <h6>Minimal change to agree</h6>
            <p>
                {counterfactual.target === 'both'
                    ? `Flipping these ${count === 1 ? 'value' : `${count} values`} makes the witness satisfy both formulas; no smaller change does:`
                    : `No valuation satisfies both formulas. Flipping these ${count === 1 ? 'value' : `${count} values`} makes the witness satisfy the ${compare} formula; no smaller change does:`}
            </p>
            <Changes changes={counterfactual.changes} explanation={explanation} />
            {counterfactual.alternatives.length > 0 && (
                <>
                    <p className='smt-diff-muted'>Other changes of the same size:</p>
                    <ol className='smt-diff-cases'>
                        {counterfactual.alternatives.map((changes, index) => (
                            <li key={index}>
                                {changes.map((change, position) => (
                                    <span key={change.symbol}>
                                        {position > 0 && ', '}
                                        <code className={variableClass(explanation, change.symbol)}>
                                            {change.symbol}
                                        </code>
                                        : {change.before} → {change.after}
                                    </span>
                                ))}
                            </li>
                        ))}
                    </ol>
                </>
            )}
            <h6>Counterfactual valuation</h6>
            <Valuation values={counterfactual.model} explanation={explanation} highlight={changed} />
        </>
    );
};

const Body = ({
    entry,
    isExplaining,
    canExplain,
    render,
}: PaneProps & { render: (e: LimbooleExplanation) => ReactNode }) => {
    if (!entry) return <Placeholder isExplaining={isExplaining} canExplain={canExplain} />;
    if (entry.error) return <Note kind='warn'>{entry.error}</Note>;
    if (!entry.explanation) return <Placeholder isExplaining={true} canExplain={true} />;
    return (
        <>
            <div className='smt-diff-section-title'>
                <strong>Witness #{entry.witnessIndex + 1}</strong>
            </div>
            {render(entry.explanation)}
        </>
    );
};

export const LimbooleAbductivePane = (props: PaneProps) => (
    <Body {...props} render={(explanation) => <AbductiveBody explanation={explanation} />} />
);

export const LimbooleCounterfactualPane = (props: PaneProps) => (
    <Body {...props} render={(explanation) => <CounterfactualBody explanation={explanation} />} />
);
