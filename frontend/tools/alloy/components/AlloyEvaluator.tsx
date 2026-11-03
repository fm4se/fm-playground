import React from 'react';
import { MDBInput } from 'mdb-react-ui-kit';
import axios from 'axios';

interface AlloyEvaluatorProps {
    height: string;
    specId: string | null;
    state: number;
    evaluatorOutput: string;
    setEvaluatorOutput: (evaluatorOutput: string) => void;
    /** Used by the default HTTP evaluator (e.g. "/diff-alloy" for the diff tool). */
    apiPrefix?: string;
    /** Custom evaluator, e.g. the Alloy engine (which may run in the browser). Overrides `apiPrefix`. */
    evaluate?: (specId: string, expr: string, state: number) => Promise<any>;
}

async function getAlloyEval(specId: string, expr: string, state: number, apiPrefix: string = '/alloy') {
    let url = `${apiPrefix}/alloy/eval?specId=${specId}&expr=${encodeURIComponent(expr)}&state=${state}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        throw error;
    }
}

const AlloyEvaluator: React.FC<AlloyEvaluatorProps> = ({
    height,
    specId,
    state,
    evaluatorOutput,
    setEvaluatorOutput,
    apiPrefix = '/alloy',
    evaluate,
}) => {
    const handleEvaluate = (expr: string) => {
        if (!expr || !specId) return;
        const run = evaluate ?? ((id: string, e: string, s: number) => getAlloyEval(id, e, s, apiPrefix));
        run(specId, expr, state).then((res) => {
            if (res.result) {
                setEvaluatorOutput(expr + '<br>&nbsp;&nbsp;' + res.result + '<br>' + evaluatorOutput);
            } else if (res.error) {
                setEvaluatorOutput(
                    expr + '<br>&nbsp;&nbsp;<span style="color: red;">' + res.error + '</span><br>' + evaluatorOutput
                );
            }
        });
    };

    const handleClear = () => {
        setEvaluatorOutput('');
    };

    return (
        <>
            <MDBInput
                label='Alloy Expressions'
                id='alloyExprForm'
                type='text'
                className='alloy-eval-expression-input'
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        handleEvaluate(e.currentTarget.value);
                    }
                }}
            />
            <div style={{ position: 'relative' }}>
                <button className='alloy-eval-close-icon' onClick={handleClear}>
                    &times;
                </button>
                <pre
                    className='plain-output-box'
                    contentEditable={false}
                    style={{
                        borderRadius: '8px',
                        height: height,
                        whiteSpace: 'pre-wrap',
                        marginBottom: '5px',
                    }}
                    dangerouslySetInnerHTML={{ __html: evaluatorOutput }}
                />
                <div
                    style={{
                        marginBottom: '5px',
                        fontSize: '0.85em',
                        color: 'var(--secondary-text-color)',
                        fontStyle: 'italic',
                        textAlign: 'center',
                    }}
                >
                    Based on the last loaded instance.
                </div>
            </div>
        </>
    );
};

export default AlloyEvaluator;
