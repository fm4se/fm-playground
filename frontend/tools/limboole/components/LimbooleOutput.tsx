import { useState, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { MDBBtn } from 'mdb-react-ui-kit';
import { limbooleResultAtom, outputAtom, outputPreviewHeightAtom, permalinkAtom } from '@/atoms';
import { logToDb } from '@/api/playgroundApi';
import { getNextLimbooleModel, hasAssignment, supportsModelIteration } from '../limbooleIterateModels';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const LimbooleOutput = () => {
    const limbooleResult = useAtomValue(limbooleResultAtom);
    const output = useAtomValue(outputAtom);
    const outputPreviewHeight = useAtomValue(outputPreviewHeightAtom);
    const permalink = useAtomValue(permalinkAtom);
    const [models, setModels] = useState<string[]>([]);
    const [currentModelIndex, setCurrentModelIndex] = useState(0);
    const [isLastModel, setIsLastModel] = useState(false);

    // Start a fresh iteration whenever limboole is executed again
    useEffect(() => {
        setModels(limbooleResult ? [limbooleResult.output] : []);
        setCurrentModelIndex(0);
        setIsLastModel(false);
    }, [limbooleResult]);

    const canIterate =
        limbooleResult !== null &&
        supportsModelIteration(limbooleResult.checkMode) &&
        hasAssignment(limbooleResult.output);
    const isAtLastModel = isLastModel && currentModelIndex === models.length - 1;

    const handleNextModel = () => {
        if (!limbooleResult) return;

        // Move to the next cached model
        if (currentModelIndex < models.length - 1) {
            setCurrentModelIndex(currentModelIndex + 1);
            return;
        }

        const nextModel = getNextLimbooleModel(limbooleResult.formula, limbooleResult.checkMode, models);
        if (!nextModel) {
            setIsLastModel(true);
            return;
        }
        setModels([...models, nextModel]);
        setCurrentModelIndex(models.length);
        logToDb(permalink.permalink || '', {
            analysis: 'SAT-ModelIteration-Next',
            model: nextModel,
        });
    };

    const handlePreviousModel = () => {
        if (currentModelIndex > 0) {
            const prevIndex = currentModelIndex - 1;
            setCurrentModelIndex(prevIndex);
            logToDb(permalink.permalink || '', {
                analysis: 'SAT-ModelIteration-Previous',
                model: models[prevIndex],
            });
        }
    };

    // Limboole output is plain text (e.g. `<stdin>:1:3: parse error`), other messages may contain HTML
    const currentModel = models[currentModelIndex] ?? limbooleResult?.output;
    const displayHtml =
        currentModel !== undefined ? escapeHtml(currentModel) : /<[^>]*>/.test(output) ? output : escapeHtml(output);

    return (
        <div>
            <pre
                id='info'
                className='plain-output-box'
                contentEditable={false}
                style={{
                    borderRadius: '8px',
                    height: outputPreviewHeight,
                    whiteSpace: 'pre-wrap',
                    marginBottom: canIterate ? '10px' : undefined,
                }}
                dangerouslySetInnerHTML={{ __html: displayHtml }}
            />

            {canIterate && (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <MDBBtn color='warning' onClick={handlePreviousModel} disabled={currentModelIndex === 0}>
                        Previous
                    </MDBBtn>
                    <MDBBtn color='success' onClick={handleNextModel} disabled={isAtLastModel}>
                        Next
                    </MDBBtn>
                </div>
            )}
            {canIterate && isAtLastModel && (
                <div style={{ textAlign: 'center', color: '#ff0000ff' }}>
                    {limbooleResult.checkMode === '0' ? 'No more counterexamples' : 'No more models'}
                </div>
            )}
        </div>
    );
};

export default LimbooleOutput;
