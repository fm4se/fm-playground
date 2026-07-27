import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { Stack } from '@mui/material';
import { MDBBtn, MDBIcon } from 'mdb-react-ui-kit';
import { VscNewFile } from 'react-icons/vsc';
import { IoLogoYoutube } from 'react-icons/io5';
import { AiOutlineFullscreen, AiOutlineFullscreenExit } from 'react-icons/ai';
import {
    editorValueAtom,
    outputAtom,
    permalinkAtom,
    languageAtom,
    isFullScreenAtom,
    isExecutingAtom,
    diffComparisonCodeAtom,
    diffComparisonHistoryIdAtom,
    smtDiffWitnessAtom,
    limbooleDiffWitnessAtom,
    alloyDiffWitnessAtom,
} from '@/atoms';
import ConfirmModal from '@/components/Utils/Modals/ConfirmModal';
import MessageModal from '@/components/Utils/Modals/MessageModal';
import CopyToClipboardBtn from '@/components/Utils/CopyToClipboardBtn';
import CodeDiffEditor from './DiffEditor';
import DiffOutput from './DiffOutput';
import { getCodeByParmalink } from '@/api/playgroundApi';
import { saveCode } from '@/api/playgroundApi';
import { diffToolInputUIMap, toolExecutionMap } from '@/ToolMaps';
import { fmpConfig } from '@/ToolMaps';

interface DiffViewAreaProps {
    editorTheme: string;
    onBackToEditingClick: () => void;
    onFullScreenButtonClick: () => void;
    originalValue?: string;
}

const DiffViewArea: React.FC<DiffViewAreaProps> = ({ editorTheme, onBackToEditingClick, onFullScreenButtonClick }) => {
    const [editorValue, setEditorValue] = useAtom(editorValueAtom);
    const [, setOutput] = useAtom(outputAtom);
    const [permalink, setPermalink] = useAtom(permalinkAtom);
    const [language] = useAtom(languageAtom);
    const [isFullScreen] = useAtom(isFullScreenAtom);
    const [isExecuting, setIsExecuting] = useAtom(isExecutingAtom);
    const [diffComparisonCode] = useAtom(diffComparisonCodeAtom);
    const [, setDiffComparisonHistoryId] = useAtom(diffComparisonHistoryIdAtom);
    const [, setSmtDiffWitness] = useAtom(smtDiffWitnessAtom);
    const [, setLimbooleDiffWitness] = useAtom(limbooleDiffWitnessAtom);
    const [, setAlloyDiffWitness] = useAtom(alloyDiffWitnessAtom);

    const [isNewSpecModalOpen, setIsNewSpecModalOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [permalinkInput, setPermalinkInput] = useState('');
    const [isLoadingFromPermalink, setIsLoadingFromPermalink] = useState(false);
    const [permalinkError, setPermalinkError] = useState('');
    const [loadedPermalinkCode, setLoadedPermalinkCode] = useState('');
    const [isAnalyzeMode, setIsAnalyzeMode] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isErrorMessageModalOpen, setIsErrorMessageModalOpen] = useState(false);

    // Check screen size on mount and resize for mobile detection
    useEffect(() => {
        const checkScreenSize = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkScreenSize();
        window.addEventListener('resize', checkScreenSize);

        return () => {
            window.removeEventListener('resize', checkScreenSize);
        };
    }, []);

    // Calculate editor height based on screen size and fullscreen state
    const getEditorHeight = () => {
        if (isFullScreen) {
            return isMobile ? '70vh' : '80vh';
        }
        return isMobile ? '40vh' : '45vh';
    };

    const openModal = () => setIsNewSpecModalOpen(true);
    const closeModal = () => setIsNewSpecModalOpen(false);

    const handleReset = () => {
        setEditorValue('');
        setOutput('');
        const infoElement = document.getElementById('info');
        if (infoElement) {
            infoElement.innerHTML = '';
        }
        setPermalink({ check: null, permalink: null });
        closeModal();
    };

    const extractPermalinkParams = (url: string) => {
        try {
            const urlObj = new URL(url);
            const check = urlObj.searchParams.get('check');
            const permalink = urlObj.searchParams.get('p');
            return { check, permalink };
        } catch {
            // If URL parsing fails, try to extract from a simple permalink format
            const match = url.match(/[?&]check=([^&]+).*[?&]p=([^&]+)/);
            if (match) {
                return { check: match[1], permalink: match[2] };
            }
            return { check: null, permalink: null };
        }
    };

    const saveDiffComparisonCode = async (loadedCheck: string, loadedPermalink: string) => {
        const res = await getCodeByParmalink(loadedCheck, loadedPermalink);
        try {
            const metadata = {
                leftSideCodeId: res.code_id,
            };

            await saveCode(editorValue, language.short + 'SynDiff', permalink.permalink ?? null, metadata);
        } catch (error) {
            console.error('Failed to save diff comparison code:', error);
        }
    };

    const handleLoadSpecButton = async () => {
        if (!permalinkInput.trim()) return;

        setIsLoadingFromPermalink(true);
        setPermalinkError('');

        try {
            const { check, permalink } = extractPermalinkParams(permalinkInput);

            if (!check || !permalink) {
                throw new Error('Invalid permalink format. Please provide a valid URL with check and p parameters.');
            }

            const response = await getCodeByParmalink(check, permalink);
            setLoadedPermalinkCode(response.code);
            setDiffComparisonHistoryId(response.data_id);
            setPermalinkError('');
            // setPermalinkInput('');

            // Save the diff comparison code after successful load
            await saveDiffComparisonCode(check, permalink);
        } catch (error: any) {
            if (error.response && error.response.status === 404) {
                setPermalinkError('Code not found. Please check the permalink and try again.');
            } else {
                setPermalinkError(
                    error.message || 'Failed to load code from permalink. Please check the URL and try again.'
                );
            }
            setLoadedPermalinkCode('');
        } finally {
            setIsLoadingFromPermalink(false);
        }
    };

    const handlePermalinkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleLoadSpecButton();
        }
    };

    const handleAnalyzeClick = async () => {
        // if diffComparisonCode is empty, show error modal
        if (!diffComparisonCode && !loadedPermalinkCode) {
            showErrorModal(
                'No Specification to compare with. Please load a specification using the permalink field above or from history.'
            );
            return;
        }
        // Entering analyze mode - run the semantic diff analysis
        setIsAnalyzeMode(true);
        setOutput('');
        setSmtDiffWitness(null);
        setLimbooleDiffWitness(null);
        setAlloyDiffWitness(null);

        try {
            setIsExecuting(true);
            const currentTool = toolExecutionMap[language.short + 'Diff'];
            // if currentTool is not in the map, show error modal
            if (currentTool) {
                currentTool();
            } else {
                showErrorModal('You can not perform semantic analysis with different tools.');
                setIsExecuting(false);
            }
        } catch (err: any) {
            if (err.code === 'ERR_NETWORK') {
                showErrorModal('Network Error. Please check your internet connection.');
            } else if (err.response?.status === 413) {
                showErrorModal('Code too long. Please reduce the size of the code.');
            } else {
                showErrorModal(
                    `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
                );
            }
        }
    };

    const showErrorModal = (message: string) => {
        setErrorMessage(message);
        setIsErrorMessageModalOpen(true);
    };

    const hideErrorModal = () => {
        setErrorMessage(null);
        setIsErrorMessageModalOpen(!isErrorMessageModalOpen);
    };

    const handleShowDiffViewClick = () => {
        if (isAnalyzeMode) {
            setIsAnalyzeMode(false);
        } else {
            setIsAnalyzeMode(true);
        }
    };

    return (
        <div className='row'>
            <div className='col-md-12 mx-auto mb-2'>
                <div className='d-flex justify-content-between align-items-center'>
                    <div className='col-md-4'>
                        <h4>Compare Specifications</h4>
                    </div>
                    <div>
                        <Stack direction='row' spacing={1}>
                            <MDBIcon
                                size='lg'
                                className='playground-icon'
                                onClick={openModal}
                                data-tooltip-id='playground-tooltip'
                                data-tooltip-content='New Spec'
                            >
                                <VscNewFile className='playground-icon' role='button' />
                            </MDBIcon>
                            <ConfirmModal
                                isOpen={isNewSpecModalOpen}
                                onClose={closeModal}
                                title='New Spec'
                                message={`Are you sure?
                              This will reset the editor and the output areas`}
                                onConfirm={handleReset}
                            />
                            {permalink.check && permalink.permalink && (
                                <MDBIcon
                                    size='lg'
                                    className='playground-icon'
                                    data-tooltip-id='playground-tooltip'
                                    data-tooltip-content='Copy Permalink'
                                >
                                    <CopyToClipboardBtn />
                                </MDBIcon>
                            )}
                            <MDBIcon size='lg' className='playground-icon' onClick={() => onFullScreenButtonClick()}>
                                {isFullScreen ? (
                                    <AiOutlineFullscreenExit
                                        className='playground-icon'
                                        data-tooltip-id='playground-tooltip'
                                        data-tooltip-content='Exit'
                                    />
                                ) : (
                                    <AiOutlineFullscreen
                                        className='playground-icon'
                                        data-tooltip-id='playground-tooltip'
                                        data-tooltip-content='Fullscreen'
                                    />
                                )}
                            </MDBIcon>
                        </Stack>
                    </div>
                </div>
                {/* Help text */}
                <div className='col-12'>
                    <small>
                        The left side shows code for comparison (read-only), the right side shows your current editable
                        code. Load any saved specification using the permalink field above or from history. For detailed
                        instructions, please watch the &nbsp;
                        <a
                            href='https://www.youtube.com/playlist?list=PLGyeoukah9NYq9ULsIuADG2r2QjX530nf'
                            target='_blank'
                            rel='noopener noreferrer'
                        >
                            <IoLogoYoutube /> video tutorial on YouTube
                        </a>
                        .
                    </small>
                </div>
            </div>

            {/* Permalink input */}
            <div className='col-12 mb-2'>
                <div className='row align-items-center g-2'>
                    <div className='col-md-4'>
                        <input
                            id='permalink-input'
                            type='text'
                            className={`form-control form-control-md ${editorTheme === 'vs-dark' ? 'bg-dark text-light border-secondary' : ''}`}
                            placeholder='Paste permalink and click Load Spec'
                            value={permalinkInput}
                            onChange={(e) => setPermalinkInput(e.target.value)}
                            onKeyDown={handlePermalinkKeyDown}
                            style={
                                editorTheme === 'vs-dark'
                                    ? {
                                          backgroundColor: '#1e1e1e',
                                          color: '#d4d4d4',
                                          borderColor: '#464647',
                                      }
                                    : {}
                            }
                            {...(editorTheme === 'vs-dark' && {
                                'data-bs-theme': 'dark',
                            })}
                        />
                    </div>
                    <div className='col-md-4'>
                        <div className='d-flex gap-2'>
                            <MDBBtn
                                rounded
                                outline
                                size='sm'
                                color='primary'
                                onClick={handleLoadSpecButton}
                                disabled={!permalinkInput.trim() || isLoadingFromPermalink}
                            >
                                {isLoadingFromPermalink ? 'Loading...' : 'Load Spec'}
                            </MDBBtn>
                            <MDBBtn rounded outline size='sm' color='success' onClick={handleShowDiffViewClick}>
                                Toggle Diff View
                            </MDBBtn>

                            <MDBBtn
                                // className={`mx-auto my-3 ${isMobile ? 'mobile-run-button' : ''}`}
                                rounded
                                outline
                                color='danger'
                                onClick={onBackToEditingClick}
                            >
                                {/* <VscEdit style={{ marginRight: '2px' }} /> */}
                                Back
                            </MDBBtn>
                        </div>
                    </div>
                </div>
                {permalinkError && (
                    <div role='alert' style={{ marginTop: '8px', color: 'red' }}>
                        <small>{permalinkError}</small>
                    </div>
                )}
                {(loadedPermalinkCode || diffComparisonCode) && !permalinkError && (
                    <div role='alert' style={{ marginTop: '8px', color: 'green' }}>
                        <small>
                            ✓ Code loaded successfully for comparison{' '}
                            {diffComparisonCode ? '(from history)' : '(from permalink)'}
                        </small>
                    </div>
                )}
            </div>

            {!isAnalyzeMode ? (
                <CodeDiffEditor
                    height={getEditorHeight()}
                    editorTheme={editorTheme}
                    originalValue={diffComparisonCode || loadedPermalinkCode}
                    modifiedValue={editorValue}
                    readOnly={false}
                    showDiffActions={!!(diffComparisonCode || loadedPermalinkCode)}
                    isAnalyzeMode={isAnalyzeMode}
                />
            ) : (
                <div
                    className='analyze-mode-layout'
                    style={{
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: '10px',
                        height: isMobile ? 'auto' : getEditorHeight(),
                    }}
                >
                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                        <CodeDiffEditor
                            height={getEditorHeight()}
                            editorTheme={editorTheme}
                            originalValue={diffComparisonCode || loadedPermalinkCode}
                            modifiedValue={editorValue}
                            readOnly={false}
                            showDiffActions={!!(diffComparisonCode || loadedPermalinkCode)}
                            isAnalyzeMode={isAnalyzeMode}
                        />
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                        <DiffOutput editorTheme={editorTheme} onFullScreenButtonClick={onFullScreenButtonClick} />
                    </div>
                </div>
            )}
            {/* Show only if language.short is SAT, SMT, or ALS */}
            {(language.short === 'SAT' || language.short === 'SMT' || language.short === 'ALS') && (
                <div className='row'>
                    <div className='col-md-6'>
                        <div style={{ paddingRight: '8px' }}>
                            {/* Additional input UI for the current language (if any) */}
                            {(() => {
                                const AdditionalUi = diffToolInputUIMap[language.short];
                                return <div className='additional-input-ui'>{AdditionalUi && <AdditionalUi />}</div>;
                            })()}

                            <MDBBtn
                                className={`mt-3 ${isMobile ? 'mobile-run-button' : ''}`}
                                style={{ width: '100%' }}
                                color='primary'
                                onClick={handleAnalyzeClick}
                                disabled={isExecuting}
                            >
                                {isExecuting ? 'Analyzing...' : 'Semantic Analysis'}
                            </MDBBtn>
                        </div>
                    </div>
                    <div className='col-md-6'>
                        {/* Right half intentionally left for auxiliary controls or output previews */}
                    </div>
                </div>
            )}
            {errorMessage && (
                <MessageModal
                    isErrorMessageModalOpen={isErrorMessageModalOpen}
                    setIsErrorMessageModalOpen={hideErrorModal}
                    toggleErrorMessageModal={hideErrorModal}
                    title='Error'
                    errorMessage={errorMessage}
                />
            )}
        </div>
    );
};

export default DiffViewArea;
