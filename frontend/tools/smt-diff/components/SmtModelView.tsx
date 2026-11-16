import { SmtLogic, SmtModel } from '../smtDiffTypes';

/** The logic line of the old output: one logic, two different ones, or none. */
export const LogicNote = ({ logic }: { logic: SmtLogic | null }) => {
    if (!logic) return null;
    if (logic.previous === null && logic.current === null) {
        return <span className='smt-diff-muted'>No logic specified</span>;
    }
    if (logic.previous !== logic.current) {
        return (
            <span className='smt-diff-warning'>
                Different logics: {logic.previous ?? 'none'} (previous) vs {logic.current ?? 'none'} (current)
            </span>
        );
    }
    return <span className='smt-diff-muted'>Logic: {logic.previous}</span>;
};

interface ModelViewProps {
    model: SmtModel;
    /** Symbols to highlight, e.g. the ones a counterfactual changes. */
    highlight?: Set<string>;
}

/**
 * A model as SMT-LIB define-funs, coloured by version: red for symbols only the previous
 * script declares, green for those only the current one declares.
 */
const SmtModelView = ({ model, highlight }: ModelViewProps) => {
    if (model.assignments.length === 0) {
        return <p className='smt-diff-muted'>The model assigns no symbols (any interpretation works).</p>;
    }
    const hasPrevious = model.assignments.some((item) => item.side === 'previous');
    const hasCurrent = model.assignments.some((item) => item.side === 'current');
    return (
        <>
            <pre className='smt-diff-smtlib'>
                {model.assignments.map((item) => (
                    <div
                        key={item.name}
                        className={`smt-diff-define smt-diff-define-${item.side ?? 'shared'}${
                            highlight?.has(item.name) ? ' smt-diff-define-highlight' : ''
                        }`}
                    >
                        {item.smtlib || `${item.name} = ${item.value}`}
                    </div>
                ))}
            </pre>
            {(hasPrevious || hasCurrent) && (
                <p className='smt-diff-legend'>
                    {hasPrevious && (
                        <span>
                            <span className='smt-diff-define-previous'>■</span> only in the previous script{' '}
                        </span>
                    )}
                    {hasCurrent && (
                        <span>
                            <span className='smt-diff-define-current'>■</span> only in the current script
                        </span>
                    )}
                </p>
            )}
        </>
    );
};

export default SmtModelView;
