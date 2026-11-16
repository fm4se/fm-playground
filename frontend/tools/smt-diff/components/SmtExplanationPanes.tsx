import type { ReactNode } from 'react';
import { MDBSpinner } from 'mdb-react-ui-kit';
import { TbAlertTriangle, TbCircleCheck, TbInfoCircle } from 'react-icons/tb';
import { REGION_TEXT } from '../smtDiffExecutor';
import { SmtAssertion, SmtDirection, SmtExplanation, SmtExplanationEntry, SmtFormula } from '../smtDiffTypes';
import SmtModelView from './SmtModelView';

interface PaneProps {
    entries: SmtExplanationEntry[];
    /** Region of the witnesses in the Output tab. */
    displayedDirection: SmtDirection | null;
    isExplaining: boolean;
    canExplain: boolean;
}

const Note = ({ kind, children }: { kind: 'ok' | 'warn' | 'info'; children: ReactNode }) => (
    <p className={`smt-diff-note smt-diff-note-${kind}`}>
        {kind === 'ok' ? <TbCircleCheck /> : kind === 'warn' ? <TbAlertTriangle /> : <TbInfoCircle />} {children}
    </p>
);

const Placeholder = ({ isExplaining, canExplain }: { isExplaining: boolean; canExplain: boolean }) => {
    if (isExplaining) {
        return (
            <div className='smt-diff-placeholder'>
                <MDBSpinner size='sm' role='status' /> Computing the explanation…
            </div>
        );
    }
    return (
        <div className='smt-diff-placeholder'>
            {canExplain
                ? 'Click Explain to explain the witness shown in the Output tab.'
                : 'There is no difference to explain for this analysis.'}
        </div>
    );
};

const Literals = ({ formula }: { formula: SmtFormula }) => {
    const literals = formula.literals.length > 0 ? formula.literals : [{ text: formula.text, smtlib: formula.smtlib }];
    return (
        <span className='smt-diff-literals'>
            {literals.map((literal, index) => (
                <span key={index}>
                    {index > 0 && <span className='smt-diff-and'>and</span>}
                    <code className='smt-diff-literal' title={`SMT-LIB: ${literal.smtlib}`}>
                        {literal.text}
                    </code>
                </span>
            ))}
        </span>
    );
};

const AssertionList = ({ assertions }: { assertions: SmtAssertion[] }) => (
    <ul className='smt-diff-assertions'>
        {assertions.map((assertion, index) => (
            <li key={index}>
                {assertion.line !== null && <span className='smt-diff-line'>line {assertion.line}</span>}
                <code>{assertion.text}</code>
                {assertion.kind === 'assumption' && <span className='smt-diff-muted'> (check-sat-assuming)</span>}
            </li>
        ))}
    </ul>
);

/** Section title: which witness of which region is explained; a witness not in the Output tab is shown inline. */
const SectionTitle = ({
    entry,
    showRegion,
    displayed,
}: {
    entry: SmtExplanationEntry;
    showRegion: boolean;
    displayed: boolean;
}) => (
    <div className='smt-diff-section-title'>
        <strong>Witness #{entry.witnessIndex + 1}</strong>
        {showRegion && <span className='smt-diff-muted'> · {REGION_TEXT[entry.direction]}</span>}
        {!displayed && entry.explanation && (
            <div className='smt-diff-muted'>
                Not shown in the Output tab: <code>{entry.explanation.witness.text}</code>
            </div>
        )}
    </div>
);

const sectionBody = (entry: SmtExplanationEntry, render: (explanation: SmtExplanation) => ReactNode) => {
    if (entry.error) {
        return <Note kind='warn'>{entry.error}</Note>;
    }
    if (!entry.explanation) {
        return <Placeholder isExplaining={true} canExplain={true} />;
    }
    return render(entry.explanation);
};

const AbductiveBody = ({ explanation }: { explanation: SmtExplanation }) => {
    const { base, compare, abduction } = explanation;
    return (
        <>
            <h6>Why the {compare} script rejects this model</h6>
            {explanation.violated_assertions.length > 0 ? (
                <>
                    <p>
                        It violates{' '}
                        {explanation.violated_assertions.length === 1 ? 'this assertion' : 'these assertions'} of the{' '}
                        {compare} script:
                    </p>
                    <AssertionList assertions={explanation.violated_assertions} />
                </>
            ) : (
                <p className='smt-diff-muted'>
                    No single assertion of the {compare} script is false; only their combination rejects the model.
                </p>
            )}
            {explanation.undetermined_assertions.length > 0 && (
                <>
                    <p className='smt-diff-muted'>The model does not determine the truth value of:</p>
                    <AssertionList assertions={explanation.undetermined_assertions} />
                </>
            )}

            <h6>Abductive explanation</h6>
            {abduction.explanation ? (
                <>
                    <p>
                        Every model of the {base} script that satisfies the following condition is rejected by the{' '}
                        {compare} script, so this condition explains the witness:
                    </p>
                    <div className='smt-diff-formula'>
                        <Literals formula={abduction.explanation} />
                    </div>
                </>
            ) : (
                <Note kind='info'>
                    The witness cannot be explained by the atomic constraints of the scripts alone (for example, because
                    the difference depends on quantifiers or on values outside the scripts' constraints).
                </Note>
            )}

            {abduction.generalizations.length > 0 && (
                <>
                    <h6>The whole difference</h6>
                    <p>
                        {abduction.coverage === 'complete'
                            ? `The models of the ${base} script rejected by the ${compare} script are exactly those satisfying one of these cases:`
                            : `Models of the ${base} script satisfying any of these cases are rejected by the ${compare} script:`}
                    </p>
                    <ol className='smt-diff-cases'>
                        {abduction.generalizations.map((formula, index) => (
                            <li key={index}>
                                <Literals formula={formula} />
                            </li>
                        ))}
                    </ol>
                    {abduction.coverage === 'complete' && (
                        <Note kind='ok'>These cases cover the whole difference.</Note>
                    )}
                    {abduction.coverage === 'limit-reached' && (
                        <Note kind='warn'>
                            The case limit was reached; further differences exist that are not listed.
                        </Note>
                    )}
                    {abduction.coverage === 'incomplete' && (
                        <Note kind='warn'>
                            Some differences are not covered by these cases
                            {abduction.uncovered_witness ? (
                                <>
                                    , for example <code>{abduction.uncovered_witness.text}</code>
                                </>
                            ) : null}
                            .
                        </Note>
                    )}
                    {abduction.coverage === 'unknown' && (
                        <Note kind='warn'>
                            The solver could not decide whether these cases cover the whole difference (possibly a
                            timeout).
                        </Note>
                    )}
                    {!abduction.minimal && (
                        <Note kind='info'>Some cases may contain conditions that are not strictly needed.</Note>
                    )}
                </>
            )}
        </>
    );
};

const TARGET_TEXT = (compare: string): Record<string, string> => ({
    both: 'The smallest change to the witness that makes it satisfy both scripts:',
    compare: `No model satisfies both scripts. The smallest change to the witness that makes it satisfy the ${compare} script:`,
    'compare-unknown': `The smallest change to the witness that makes it satisfy the ${compare} script (it is unknown whether a model of both scripts exists):`,
});

const CounterfactualBody = ({ explanation }: { explanation: SmtExplanation }) => {
    const { counterfactual, compare } = explanation;
    if (counterfactual.status === 'unknown') {
        return (
            <Note kind='warn'>
                The optimizer could not decide (possibly a timeout); no counterfactual is available.
            </Note>
        );
    }
    if (!counterfactual.model) {
        return <Note kind='info'>No nearby model accepted by the {compare} script was found.</Note>;
    }
    const changed = new Set(counterfactual.changes.map((change) => change.symbol));
    return (
        <>
            <h6>Minimal change to agree</h6>
            <p>{TARGET_TEXT(compare)[counterfactual.target ?? 'compare-unknown']}</p>
            {counterfactual.changes.length > 0 ? (
                <ul className='smt-diff-changes'>
                    {counterfactual.changes.map((change) => (
                        <li key={change.symbol}>
                            <code>{change.symbol}</code>: <code className='smt-diff-before'>{change.before}</code>
                            <span className='smt-diff-arrow'>→</span>
                            <code className='smt-diff-after'>{change.after}</code>
                        </li>
                    ))}
                </ul>
            ) : (
                <Note kind='info'>
                    The two models differ only in solver-internal values, not in the symbols of the scripts.
                </Note>
            )}
            {counterfactual.note && (
                <Note kind='info'>This change is not guaranteed to be the smallest: {counterfactual.note}.</Note>
            )}
            {!counterfactual.note && !counterfactual.optimized && (
                <Note kind='info'>
                    The optimizer does not support these constraints: this is a nearby model, not necessarily the
                    nearest.
                </Note>
            )}
            <h6>Counterfactual model</h6>
            <SmtModelView model={counterfactual.model} highlight={changed} />
        </>
    );
};

const Sections = ({
    entries,
    displayedDirection,
    isExplaining,
    canExplain,
    render,
}: PaneProps & { render: (explanation: SmtExplanation) => ReactNode }) => {
    if (entries.length === 0) {
        return <Placeholder isExplaining={isExplaining} canExplain={canExplain} />;
    }
    return (
        <>
            {entries.map((entry) => (
                <section key={`${entry.direction}:${entry.witnessIndex}`} className='smt-diff-section'>
                    <SectionTitle
                        entry={entry}
                        showRegion={entries.length > 1}
                        displayed={entry.direction === displayedDirection}
                    />
                    {sectionBody(entry, render)}
                </section>
            ))}
        </>
    );
};

export const AbductivePane = (props: PaneProps) => (
    <Sections {...props} render={(explanation) => <AbductiveBody explanation={explanation} />} />
);

export const CounterfactualPane = (props: PaneProps) => (
    <Sections {...props} render={(explanation) => <CounterfactualBody explanation={explanation} />} />
);
