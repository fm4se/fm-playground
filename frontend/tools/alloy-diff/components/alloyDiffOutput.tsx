import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { IconButton } from '@mui/material';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import { TbBinaryTree } from 'react-icons/tb';
import { CiViewTable, CiTextAlignLeft } from 'react-icons/ci';
import { LiaClipboardListSolid } from 'react-icons/lia';
import { MDBBtn, MDBTabs, MDBTabsItem, MDBTabsLink, MDBTabsContent, MDBTabsPane } from 'mdb-react-ui-kit';
import { isFullScreenAtom, alloyDiffWitnessAtom, alloyDiffOptionsAtom } from '@/atoms';
import { getNextAlloyDiffWitness } from '../alloyDiffExecutor';
import { jotaiStore, permalinkAtom } from '@/atoms';
import { logToDb } from '@/api/playgroundApi';
import AlloyCytoscapeGraph from '@/../tools/alloy/components/AlloyCytoscapeGraph';
import AlloyEvaluator from '@/../tools/alloy/components/AlloyEvaluator';
import { getGraphData, getTraceLengthAndBackloop } from '@/../tools/alloy/alloyUtils';
import '@/../tools/alloy/components/AlloyOutput.css';

const AlloyDiffOutput = () => {
    const [isFullScreen] = useAtom(isFullScreenAtom);
    const [alloyDiffWitness, setAlloyDiffWitness] = useAtom(alloyDiffWitnessAtom);
    const [alloyDiffOption] = useAtom(alloyDiffOptionsAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const [witnesses, setWitnesses] = useState<any[]>([]);
    const [currentWitnessIndex, setCurrentWitnessIndex] = useState(0);
    const [specId, setSpecId] = useState<string | null>(null);
    const [isNextWitnessExecuting, setIsNextWitnessExecuting] = useState(false);
    const [isLastWitness, setIsLastWitness] = useState(false);
    const [witnessMessage, setWitnessMessage] = useState('');
    const [hasWitness, setHasWitness] = useState(false);

    // Visualization and Tab States
    const [activeTab, setActiveTab] = useState('graph');
    const [alloyVizGraph, setAlloyVizGraph] = useState<{ data: { id: any; label: any } }[]>([]);
    const [alloyTabularInstance, setAlloyTabularInstance] = useState('');
    const [alloyTextInstance, setAlloyTextInstance] = useState('');
    const [isTemporal, setIsTemporal] = useState(false);
    const [alloyTraceIndex, setAlloyTraceIndex] = useState(0);
    const [instanceIndexToShow, setInstanceIndexToShow] = useState(0);
    const [alloyTraceLoop, setAlloyTraceLoop] = useState('');
    const [evaluatorOutput, setEvaluatorOutput] = useState('');

    useEffect(() => {
        if (alloyDiffWitness) {
            const isNavigationUpdate = witnesses.some((witness) => witness === alloyDiffWitness);
            if (!isNavigationUpdate) {
                setWitnesses([alloyDiffWitness]);
                setCurrentWitnessIndex(0);
                setIsLastWitness(false);
            }

            if (alloyDiffWitness.specId) {
                const sid = Array.isArray(alloyDiffWitness.specId) ? alloyDiffWitness.specId[0] : alloyDiffWitness.specId;
                setSpecId(sid);
                setHasWitness(true);
                setWitnessMessage(alloyDiffWitness.semanticRelationMessage || '');

                // Parse XML visualization data
                if ('alloy' in alloyDiffWitness) {
                    const alloy = (alloyDiffWitness as { [key: string]: any })['alloy'];
                    const instances = Array.isArray(alloy['instance']) ? alloy['instance'] : [alloy['instance']];
                    const temporal = instances.some((inst: any) => inst['mintrace'] !== -1);
                    setIsTemporal(temporal);

                    const { traceLength, backloop } = getTraceLengthAndBackloop(instances[0]);
                    let idxToShow = 0;
                    if (instances.length > 1) {
                        if (alloyTraceIndex < instances.length) {
                            idxToShow = alloyTraceIndex;
                        } else {
                            const m = (alloyTraceIndex - traceLength) % (traceLength - backloop);
                            idxToShow = backloop + m;
                        }
                    }
                    setInstanceIndexToShow(idxToShow);

                    const graphData = getGraphData(instances[idxToShow]);
                    setAlloyVizGraph(graphData);

                    if (temporal) {
                        setAlloyTraceLoop(`Trace Length: ${traceLength} | Backloop: ${backloop}`);
                    } else {
                        setAlloyTraceLoop('');
                    }
                } else {
                    setAlloyVizGraph([]);
                }

                // Parse Tabular Instance
                if ('tabularInstance' in alloyDiffWitness) {
                    const tab = Array.isArray(alloyDiffWitness.tabularInstance)
                        ? alloyDiffWitness.tabularInstance[0]
                        : alloyDiffWitness.tabularInstance;
                    setAlloyTabularInstance(tab || '');
                } else if (alloyDiffWitness.witness) {
                    setAlloyTabularInstance(alloyDiffWitness.witness);
                }

                // Parse Text Instance
                if ('textInstance' in alloyDiffWitness) {
                    const txt = Array.isArray(alloyDiffWitness.textInstance)
                        ? alloyDiffWitness.textInstance[0]
                        : alloyDiffWitness.textInstance;
                    setAlloyTextInstance(txt || '');
                }
            } else if (alloyDiffWitness.error) {
                setHasWitness(false);
                setWitnessMessage(alloyDiffWitness.error);
                setAlloyVizGraph([]);
            }
        } else {
            setWitnesses([]);
            setCurrentWitnessIndex(0);
            setSpecId(null);
            setIsNextWitnessExecuting(false);
            setIsLastWitness(false);
            setWitnessMessage('');
            setHasWitness(false);
            setAlloyVizGraph([]);
        }
    }, [alloyDiffWitness, alloyTraceIndex]);

    const handleNextWitness = () => {
        if (currentWitnessIndex < witnesses.length - 1) {
            const nextIndex = currentWitnessIndex + 1;
            setCurrentWitnessIndex(nextIndex);
            setAlloyDiffWitness(witnesses[nextIndex]);
            setAlloyTraceIndex(0);
            return;
        }

        if (!specId) return;

        setIsNextWitnessExecuting(true);
        getNextAlloyDiffWitness(specId, permalink.permalink || '')
            .then((data) => {
                if (data.error) {
                    setIsLastWitness(true);
                    setWitnessMessage('No more witnesses');
                    setIsNextWitnessExecuting(false);
                    return;
                }

                if (alloyDiffWitness.semanticRelationMessage) {
                    data.semanticRelationMessage = alloyDiffWitness.semanticRelationMessage;
                }

                const updatedWitnesses = [...witnesses, data];
                const newIndex = updatedWitnesses.length - 1;
                setWitnesses(updatedWitnesses);
                setCurrentWitnessIndex(newIndex);
                setAlloyDiffWitness(data);
                setAlloyTraceIndex(0);
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
            setAlloyDiffWitness(witnesses[prevIndex]);
            setAlloyTraceIndex(0);
            setIsLastWitness(false);
            logToDb(permalink.permalink || '', {
                tool: 'ALSSemDiff-Previous',
                witness: witnesses[prevIndex],
                specId: specId,
            });
        }
    };

    const handleForwardTrace = () => {
        setAlloyTraceIndex((prevIndex) => prevIndex + 1);
    };

    const handleBackwardTrace = () => {
        setAlloyTraceIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : 0));
    };

    const handleTabClick = (tabValue: string) => {
        if (tabValue === activeTab) return;
        setActiveTab(tabValue);
    };

    const getAlloyTabularInstance = (tabularInstance: string, state: number) => {
        if (!tabularInstance) return 'No tabular data available';
        if (tabularInstance.includes('------State')) {
            const states = tabularInstance.split('------State').slice(1);
            const selectedState = states[state]?.split('\n').slice(1).join('\n') || '';
            return selectedState;
        }
        return tabularInstance;
    };

    const getAlloyTextInstance = (textInstance: string, state: number) => {
        if (!textInstance) return 'No text data available';
        if (textInstance.includes('------State')) {
            const instanceHeader = textInstance.split('------State')[0];
            const states = textInstance.split('------State').slice(1);
            const selectedState = states[state]?.split('\n').slice(1).join('\n') || '';
            return `${instanceHeader}${selectedState}`;
        }
        return textInstance;
    };

    const showNavigation = specId !== 'Equivalence' && alloyDiffOption !== 'Equivalence';

    return (
        <div>
            {witnessMessage && (
                <pre
                    className='plain-alloy-message-box'
                    contentEditable={false}
                    style={{
                        borderRadius: '8px',
                        whiteSpace: 'pre-wrap',
                        padding: '15px',
                        marginBottom: '15px',
                        maxHeight: '150px',
                        overflowY: 'auto',
                        width: '100%'
                    }}
                    dangerouslySetInnerHTML={{ __html: witnessMessage }}
                />
            )}
            {hasWitness ? (
                <div>
                    <MDBTabs justify>
                        <MDBTabsItem>
                            <MDBTabsLink onClick={() => handleTabClick('graph')} active={activeTab === 'graph'}>
                                <TbBinaryTree /> Viz
                            </MDBTabsLink>
                        </MDBTabsItem>
                        <MDBTabsItem>
                            <MDBTabsLink onClick={() => handleTabClick('tabular')} active={activeTab === 'tabular'}>
                                <CiViewTable /> Table
                            </MDBTabsLink>
                        </MDBTabsItem>
                        <MDBTabsItem>
                            <MDBTabsLink onClick={() => handleTabClick('text')} active={activeTab === 'text'}>
                                <CiTextAlignLeft /> Text
                            </MDBTabsLink>
                        </MDBTabsItem>
                        <MDBTabsItem>
                            <MDBTabsLink onClick={() => handleTabClick('eval')} active={activeTab === 'eval'}>
                                <LiaClipboardListSolid /> Eval
                            </MDBTabsLink>
                        </MDBTabsItem>
                    </MDBTabs>

                    {activeTab === 'eval' && (
                        <AlloyEvaluator
                            height={isFullScreen ? '80vh' : '45vh'}
                            specId={specId}
                            state={instanceIndexToShow}
                            evaluatorOutput={evaluatorOutput}
                            setEvaluatorOutput={setEvaluatorOutput}
                        />
                    )}

                    <MDBTabsContent>
                        <MDBTabsPane open={activeTab === 'graph'}>
                            <AlloyCytoscapeGraph
                                alloyVizGraph={alloyVizGraph}
                                height={isFullScreen ? '75vh' : '42vh'}
                            />
                        </MDBTabsPane>
                        <MDBTabsPane open={activeTab === 'tabular'}>
                            <pre
                                className='plain-alloy-message-box'
                                contentEditable={false}
                                style={{
                                    borderRadius: '8px',
                                    height: isFullScreen ? '75vh' : '42vh',
                                    whiteSpace: 'pre-wrap',
                                }}
                                dangerouslySetInnerHTML={{
                                    __html: getAlloyTabularInstance(alloyTabularInstance, instanceIndexToShow),
                                }}
                            />
                        </MDBTabsPane>
                        <MDBTabsPane open={activeTab === 'text'}>
                            <pre
                                className='plain-alloy-message-box'
                                contentEditable={false}
                                style={{
                                    borderRadius: '8px',
                                    height: isFullScreen ? '75vh' : '42vh',
                                    whiteSpace: 'pre-wrap',
                                }}
                                dangerouslySetInnerHTML={{
                                    __html: getAlloyTextInstance(alloyTextInstance, instanceIndexToShow),
                                }}
                            />
                        </MDBTabsPane>
                    </MDBTabsContent>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: '10px',
                        }}
                    >
                        {showNavigation && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <MDBBtn
                                    color='warning'
                                    onClick={handlePreviousWitness}
                                    disabled={currentWitnessIndex === 0}
                                >
                                    Previous Witness
                                </MDBBtn>
                                <MDBBtn
                                    color='success'
                                    onClick={handleNextWitness}
                                    disabled={isNextWitnessExecuting || isLastWitness}
                                >
                                    {isNextWitnessExecuting ? 'Computing...' : 'Next Witness'}
                                </MDBBtn>
                            </div>
                        )}

                        {isTemporal && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <IconButton
                                    aria-label='backward'
                                    size='small'
                                    disabled={alloyTraceIndex === 0}
                                    color='info'
                                    onClick={handleBackwardTrace}
                                >
                                    <FaArrowLeft />
                                </IconButton>
                                <span style={{ fontWeight: 'bold' }}>State {instanceIndexToShow}</span>
                                <IconButton aria-label='forward' size='small' color='info' onClick={handleForwardTrace}>
                                    <FaArrowRight />
                                </IconButton>
                                {alloyTraceLoop && (
                                    <span style={{ fontSize: '0.85em', color: '#666', marginLeft: '8px' }}>
                                        ({alloyTraceLoop})
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div style={{ height: isFullScreen ? '80vh' : '45vh' }}>
                    {/* The message is already displayed above. We just need to fill the empty space if needed, or we can just leave it empty. */}
                </div>
            )}
        </div>
    );
};

export default AlloyDiffOutput;
