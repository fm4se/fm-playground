import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAtom } from 'jotai';
import { IconButton } from '@mui/material';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import { TbBinaryTree } from 'react-icons/tb';
import { CiViewTable } from 'react-icons/ci';
import { CiTextAlignLeft } from 'react-icons/ci';
import { LiaClipboardListSolid } from 'react-icons/lia';
import { MDBBtn, MDBInput, MDBTabs, MDBTabsItem, MDBTabsLink, MDBTabsContent, MDBTabsPane } from 'mdb-react-ui-kit';
import AlloyCytoscapeGraph from './AlloyCytoscapeGraph';
import AlloyEvaluator from './AlloyEvaluator';
import { getLineToHighlight } from '@/../tools/common/lineHighlightingUtil';
import { getGraphData, parseAlloyErrorMessage, getTraceLengthAndBackloop } from '@/../tools/alloy/alloyUtils';
import './AlloyOutput.css';
import { lineToHighlightAtom, isFullScreenAtom, alloyInstanceAtom } from '@/atoms';

async function getAlloyNextInstance(specId: string | null) {
    let url = '/alloy/alloy/nextInstance';
    if (!url) {
        throw new Error('Alloy Next Instance API URL not found');
    }
    try {
        const response = await axios.post(url, specId, {
            headers: {
                'Content-Type': 'text/plain',
            },
        });
        return response.data;
    } catch (error) {
        throw error;
    }
}

const AlloyOutput = () => {
    const [, setLineToHighlight] = useAtom(lineToHighlightAtom);
    const [alloyInstance, setAlloyInstance] = useAtom(alloyInstanceAtom);
    const [isFullScreen] = useAtom(isFullScreenAtom);
    const [alloyTraceIndex, setalloyTraceIndex] = useState(0);
    const [alloySpecId, setAlloySpecId] = useState(null);
    const [alloyVizGraph, setAlloyVizGraph] = useState<{ data: { id: any; label: any } }[]>([]);
    const [isTemporal, setIsTemporal] = useState(false);
    const [isInstance, setIsInstance] = useState(true);
    const [alloyErrorMessage, setAlloyErrorMessage] = useState('');
    const [alloyPlainMessage, setAlloyPlainMessage] = useState('');
    const [alloyTraceLoop, setAlloyTraceLoop] = useState('');
    const [lastInstance, setLastInstance] = useState<{ data: { id: any; label: any } }[]>([]);
    const [isLastInstance, setIsLastInstance] = useState(false);
    const [alloyTabularInstance, setAlloyTabularInstance] = useState('');
    const [alloyTextInstance, setAlloyTextInstance] = useState('');
    const [activeTab, setActiveTab] = useState('graph');
    const [isNextInstanceExecuting, setIsNextInstanceExecuting] = useState(false);
    const [instanceIndexToShow, setInstanceIndexToShow] = useState(0);
    const [evaluatorOutput, setEvaluatorOutput] = useState('');

    /**
     * Update the Alloy instance in the state when the API response is received
     */
    useEffect(() => {
        setAlloyInstance(alloyInstance);
        setAlloySpecId((alloyInstance as any).specId);
        setalloyTraceIndex(0);
        setIsLastInstance(false);
    }, [alloyInstance]);

    /**
     * Prepare the Alloy instance for visualization from the API response
     * @param {Object} alloyInstance - The Alloy instance object
     */
    useEffect(() => {
        if (alloyInstance && 'alloy' in alloyInstance && 'specId' in alloyInstance) {
            // if there is an instance
            const alloy = (alloyInstance as { [key: string]: any })['alloy'];
            const specId = (alloyInstance as any)['specId'][0] || (alloyInstance as any)['specId'];
            setAlloySpecId(specId);
            setIsInstance(true);
            const instances = Array.isArray(alloy['instance']) ? alloy['instance'] : [alloy['instance']];
            setIsTemporal(instances.some((instance) => instance['mintrace'] !== -1));
            const { traceLength, backloop } = getTraceLengthAndBackloop(instances[0]);
            if (instances.length > 1) {
                if (alloyTraceIndex < instances.length) {
                    setInstanceIndexToShow(alloyTraceIndex);
                } else {
                    const m = (alloyTraceIndex - traceLength) % (traceLength - backloop);
                    setInstanceIndexToShow(backloop + m);
                }
                const graphData = getGraphData(instances[instanceIndexToShow]);
                setAlloyPlainMessage(graphData.length === 0 ? 'Empty Instance' : '');
                setAlloyVizGraph(graphData);
                setLastInstance(graphData);
                if (isTemporal) setAlloyTraceLoop(`Trace Length: ${traceLength} | Backloop: ${backloop}`);
                else setAlloyTraceLoop('');
            } else {
                // instance found but empty
                const graphData = getGraphData(instances[0]);
                setAlloyPlainMessage(graphData.length === 0 ? 'Empty Instance' : '');
                setAlloyVizGraph(graphData);
                setLastInstance(graphData);
                if (isTemporal) setAlloyTraceLoop(`Trace Length: ${traceLength} | Backloop: ${backloop}`);
                else setAlloyTraceLoop('');
            }
        } else if (alloyInstance && 'error' in alloyInstance) {
            // instance not found and error message is present
            setAlloyVizGraph([]);
            if (
                typeof alloyInstance === 'object' &&
                alloyInstance !== null &&
                'error' in alloyInstance &&
                (alloyInstance as any)['error'].includes('No instance found')
            ) {
                // error for no instance found for the given command
                setIsInstance(false);
                setAlloyErrorMessage('No instance found');
            } else if (
                typeof alloyInstance === 'object' &&
                alloyInstance !== null &&
                'error' in alloyInstance &&
                (alloyInstance as any)['error'].includes('No more instances')
            ) {
                // when we reach the last instance, keep the last instance in the graph and show the message
                setIsInstance(true);
                setAlloyVizGraph(lastInstance);
                setAlloyPlainMessage('No more instances');
            } else if (alloyInstance['error']) {
                // other errors like syntax error, type error etc.
                setIsInstance(false);
                setAlloyErrorMessage(parseAlloyErrorMessage(alloyInstance['error']));
                const errorMessage = typeof alloyInstance['error'] === 'string' ? alloyInstance['error'] : '';
                setLineToHighlight(getLineToHighlight(errorMessage, 'alloy') || []);
            } else {
                // unknown error
                setIsInstance(false);
                setAlloyPlainMessage(alloyInstance['error'] as string);
            }
        }

        // Tabular instance
        if (alloyInstance && typeof alloyInstance === 'object' && 'tabularInstance' in alloyInstance) {
            setAlloyTabularInstance((alloyInstance as any)['tabularInstance'][0]);
        }

        // Text instance
        if (alloyInstance && 'textInstance' in alloyInstance) {
            setAlloyTextInstance((alloyInstance as any)['textInstance'][0]);
        }
    }, [alloyInstance, alloyTraceIndex, isTemporal]);

    // FIXME: This might be merged with the above useEffect.
    // cause: asynchronous updates in React's state when we change the instanceIndexToShow to useState.
    useEffect(() => {
        if (alloyInstance && 'alloy' in alloyInstance && 'specId' in alloyInstance) {
            const alloy = (alloyInstance as { [key: string]: any })['alloy'];
            const instances = Array.isArray(alloy['instance']) ? alloy['instance'] : [alloy['instance']];

            if (isTemporal && instances.length > 1) {
                const { traceLength, backloop } = getTraceLengthAndBackloop(instances[0]);
                const instanceIndexToShow =
                    alloyTraceIndex < traceLength
                        ? alloyTraceIndex
                        : backloop + ((alloyTraceIndex - traceLength) % (traceLength - backloop));

                const graphData = getGraphData(instances[instanceIndexToShow]);
                setAlloyVizGraph(graphData);
            }
        }
    }, [alloyInstance, alloyTraceIndex, isTemporal]);

    const handleNextInstance = () => {
        setIsNextInstanceExecuting(true);
        getAlloyNextInstance(alloySpecId)
            .then((data) => {
                if (data['error'] && data['error'].includes('No instance found')) {
                    setAlloyInstance(alloyInstance);
                    setIsLastInstance(true);
                    setalloyTraceIndex(0);
                    setIsNextInstanceExecuting(false);
                    return;
                }
                setAlloyInstance(data);
                setalloyTraceIndex(0);
                setIsNextInstanceExecuting(false);
            })
            .catch((error) => {
                console.log(error);
                setIsNextInstanceExecuting(false);
            });
    };

    const handleForwardTrace = () => {
        setalloyTraceIndex((prevIndex) => prevIndex + 1);
    };

    const handleBackwardTrace = () => {
        setalloyTraceIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : 0));
    };

    const handleTabClick = (tabValue: string) => {
        if (tabValue === activeTab) return;
        setActiveTab(tabValue);
    };

    /**
     * Alloy API returns all the states in a single instance.
     * We need to extract the selected state from the instance.
     */
    const getAlloyTextInstance = (alloyTextInstance: string, state: number) => {
        const instanceHeader = alloyTextInstance.split('------State')[0];
        const states = alloyTextInstance.split('------State').slice(1);
        const selectedState = states[state]?.split('\n').slice(1).join('\n') || '';
        return `${instanceHeader}${selectedState}`;
    };

    /**
     * Alloy API returns all the states in a single instance.
     * We need to extract the selected state from the instance.
     */
    const getAlloyTabularInstance = (alloyTabularInstance: string, state: number) => {
        // For debugging - check if the instance is empty or null
        if (!alloyTabularInstance) {
            return 'No tabular data available';
        }
        // Check if the tabular instance contains state separators
        if (alloyTabularInstance.includes('------State')) {
            const states = alloyTabularInstance.split('------State').slice(1);
            const selectedState = states[state]?.split('\n').slice(1).join('\n') || '';
            return selectedState;
        } else {
            return alloyTabularInstance;
        }
    };

    return (
        <div>
            {isInstance ? (
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

                    {activeTab == 'eval' && (
                        <AlloyEvaluator
                            height={isFullScreen ? '80vh' : '52vh'}
                            specId={alloySpecId}
                            state={instanceIndexToShow}
                            evaluatorOutput={evaluatorOutput}
                            setEvaluatorOutput={setEvaluatorOutput}
                        />
                    )}

                    <MDBTabsContent>
                        <MDBTabsPane open={activeTab === 'graph'}>
                            <AlloyCytoscapeGraph
                                alloyVizGraph={alloyVizGraph}
                                height={isFullScreen ? '80vh' : '57vh'}
                            />
                        </MDBTabsPane>
                        <MDBTabsPane open={activeTab === 'tabular'}>
                            <pre
                                className='plain-alloy-message-box'
                                contentEditable={false}
                                style={{
                                    borderRadius: '8px',
                                    height: isFullScreen ? '80vh' : '57vh',
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
                                    height: isFullScreen ? '80vh' : '57vh',
                                    whiteSpace: 'pre-wrap',
                                }}
                                dangerouslySetInnerHTML={{
                                    __html: getAlloyTextInstance(alloyTextInstance, instanceIndexToShow),
                                }}
                            />
                        </MDBTabsPane>
                    </MDBTabsContent>

                    <div>
                        <pre
                            className='plain-alloy-message-box'
                            contentEditable={false}
                            style={{
                                height: alloyPlainMessage ? 'auto' : '35px',
                            }}
                            dangerouslySetInnerHTML={{
                                __html: alloyPlainMessage
                                    ? alloyPlainMessage + (alloyTraceLoop ? ' | ' + alloyTraceLoop : '')
                                    : alloyTraceLoop,
                            }}
                        />
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        {alloyInstance && 'alloy' in alloyInstance && 'specId' in alloyInstance && (
                            <MDBBtn
                                color='success'
                                onClick={handleNextInstance}
                                disabled={isNextInstanceExecuting || isLastInstance}
                            >
                                {isNextInstanceExecuting ? 'Computing...' : isTemporal ? 'Next Trace' : 'Next Instance'}
                                {/* {isTemporal ? "Next Trace" : "Next Instance"} */}
                            </MDBBtn>
                        )}
                        {isTemporal && (
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                }}
                            >
                                <IconButton onClick={handleBackwardTrace}>
                                    <FaArrowLeft className='playground-icon' role='button' />
                                </IconButton>
                                <MDBInput
                                    style={{ width: '50px', textAlign: 'center' }}
                                    type='text'
                                    readonly
                                    value={alloyTraceIndex}
                                />
                                <IconButton onClick={handleForwardTrace}>
                                    <FaArrowRight className='playground-icon' role='button' />
                                </IconButton>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <pre
                    className='plain-output-box'
                    contentEditable={false}
                    style={{
                        borderRadius: '8px',
                        height: isFullScreen ? '80vh' : '57vh',
                        whiteSpace: 'pre-wrap',
                    }}
                    dangerouslySetInnerHTML={{ __html: alloyErrorMessage }}
                />
            )}
        </div>
    );
};

export default AlloyOutput;
