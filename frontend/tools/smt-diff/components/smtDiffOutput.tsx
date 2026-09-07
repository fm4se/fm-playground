import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAtom } from 'jotai';
import { MDBBtn } from 'mdb-react-ui-kit';
import { isFullScreenAtom, smtDiffWitnessAtom } from '@/atoms';
import { getNextSmtDiffWitness } from '../smtDiffExecutor';
import { jotaiStore, permalinkAtom } from '@/atoms';
import { logToDb } from '@/api/playgroundApi';

const SmtDiffOutput = () => {
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const interval = setInterval(() => {
            const target = document.getElementById('diff-navigation-portal-target');
            if (target) {
                setPortalTarget(target);
                clearInterval(interval);
            }
        }, 100);
        return () => clearInterval(interval);
    }, []);

    const [isFullScreen] = useAtom(isFullScreenAtom);
    const [smtDiffWitness, setSmtDiffWitness] = useAtom(smtDiffWitnessAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const [witnesses, setWitnesses] = useState<any[]>([]);
    const [currentWitnessIndex, setCurrentWitnessIndex] = useState(0);
    const [specId, setSpecId] = useState<string | null>(null);
    const [isNextWitnessExecuting, setIsNextWitnessExecuting] = useState(false);
    const [isLastWitness, setIsLastWitness] = useState(false);
    const [witnessMessage, setWitnessMessage] = useState('');
    const [hasWitness, setHasWitness] = useState(false);

    /**
     * Update the witness in the state when the API response is received
     */
    useEffect(() => {
        if (smtDiffWitness) {
            // Reset witnesses array when we get a completely new witness (e.g., new specification run)
            const isNavigationUpdate = witnesses.some((witness) => witness === smtDiffWitness);
            if (!isNavigationUpdate) {
                setWitnesses([smtDiffWitness]);
                setCurrentWitnessIndex(0);
                setIsLastWitness(false); // Reset the last witness flag for new analysis
            }

            if (smtDiffWitness.specId) {
                setSpecId(smtDiffWitness.specId);
                setHasWitness(true);
                setWitnessMessage('');
            } else if (smtDiffWitness.error) {
                setHasWitness(false);
                setWitnessMessage(smtDiffWitness.error);
            }
        } else {
            // Clear all state when witness is set to null
            setWitnesses([]);
            setCurrentWitnessIndex(0);
            setSpecId(null);
            setIsNextWitnessExecuting(false);
            setIsLastWitness(false);
            setWitnessMessage('');
            setHasWitness(false);
        }
    }, [smtDiffWitness]);

    const handleNextWitness = () => {
        // Check if we already have a next witness cached
        if (currentWitnessIndex < witnesses.length - 1) {
            // Move to next cached witness
            const nextIndex = currentWitnessIndex + 1;
            setCurrentWitnessIndex(nextIndex);
            setSmtDiffWitness(witnesses[nextIndex]);
            return;
        }

        // Fetch new witness from API
        if (!specId) return;

        setIsNextWitnessExecuting(true);
        getNextSmtDiffWitness(specId, permalink.permalink || '')
            .then((data) => {
                if (data.error) {
                    setIsLastWitness(true);
                    setWitnessMessage('No more witnesses');
                    setIsNextWitnessExecuting(false);
                    return;
                }

                // Add new witness to the array
                const updatedWitnesses = [...witnesses, data];
                const newIndex = updatedWitnesses.length - 1;
                setWitnesses(updatedWitnesses);
                setCurrentWitnessIndex(newIndex);
                setSmtDiffWitness(data);
                setIsNextWitnessExecuting(false);
            })
            .catch((error) => {
                console.error('Error fetching next witness:', error);
                if (error.response?.status === 404) {
                    setIsLastWitness(true);
                    setWitnessMessage('No more witnesses');
                }
                setIsNextWitnessExecuting(false);
            });
    };

    const handlePreviousWitness = () => {
        if (currentWitnessIndex > 0) {
            const prevIndex = currentWitnessIndex - 1;
            setCurrentWitnessIndex(prevIndex);
            setSmtDiffWitness(witnesses[prevIndex]);
            setIsLastWitness(false);
            logToDb(permalink.permalink || '', {
                tool: 'SMTSemDiff-Previous',
                witness: witnesses[prevIndex],
                specId: specId,
            });
        }
    };

    const getCurrentWitness = () => {
        if (witnesses.length > 0 && witnesses[currentWitnessIndex]) {
            return witnesses[currentWitnessIndex].witness || '';
        }
        return '';
    };

    return (
        <div>
            {hasWitness ? (
                <div>
                    <pre
                        className='plain-output-box'
                        contentEditable={false}
                        style={{
                            borderRadius: '8px',
                            height: isFullScreen ? '70vh' : '45vh',
                            whiteSpace: 'pre-wrap',
                            marginBottom: '10px',
                        }}
                        dangerouslySetInnerHTML={{ __html: getCurrentWitness() }}
                    />

                    {specId !== 'semantic-relation' &&
                        (portalTarget
                            ? createPortal(
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingRight: '8px' }}>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                          <MDBBtn
                                              color='warning'
                                              onClick={handlePreviousWitness}
                                              disabled={currentWitnessIndex === 0}
                                          >
                                              Previous
                                          </MDBBtn>

                                          <MDBBtn
                                              color='success'
                                              onClick={handleNextWitness}
                                              disabled={isNextWitnessExecuting || isLastWitness}
                                          >
                                              {isNextWitnessExecuting ? 'Computing...' : 'Next'}
                                          </MDBBtn>
                                      </div>
                                  </div>,
                                  portalTarget
                              )
                            : (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                          <MDBBtn
                                              color='warning'
                                              onClick={handlePreviousWitness}
                                              disabled={currentWitnessIndex === 0}
                                          >
                                              Previous
                                          </MDBBtn>

                                          <MDBBtn
                                              color='success'
                                              onClick={handleNextWitness}
                                              disabled={isNextWitnessExecuting || isLastWitness}
                                          >
                                              {isNextWitnessExecuting ? 'Computing...' : 'Next'}
                                          </MDBBtn>
                                      </div>
                                  </div>
                              ))}
                    {witnessMessage && <div style={{ textAlign: 'center', color: '#ff0000ff' }}>{witnessMessage}</div>}
                </div>
            ) : (
                <div
                    className='plain-output-box'
                    style={{
                        borderRadius: '8px',
                        height: isFullScreen ? '80vh' : '45vh',
                        whiteSpace: 'pre-wrap',
                        padding: '15px',
                        overflowY: 'auto',
                    }}
                    dangerouslySetInnerHTML={{ __html: witnessMessage }}
                />
            )}
        </div>
    );
};

export default SmtDiffOutput;
