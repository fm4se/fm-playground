import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useAtom } from 'jotai';
import { Stack } from '@mui/material';
import { MDBBtn, MDBIcon } from 'mdb-react-ui-kit';
import { VscDiffSingle, VscNewFile } from 'react-icons/vsc';
import { AiOutlineFullscreen, AiOutlineFullscreenExit } from 'react-icons/ai';
import Toggle from 'react-toggle';
import {
    enableLspAtom,
    editorValueAtom,
    outputAtom,
    permalinkAtom,
    languageAtom,
    isExecutingAtom,
    isFullScreenAtom,
    lineToHighlightAtom,
    isDiffViewModeAtom,
    originalCodeAtom,
} from '@/atoms';
import ConfirmModal from '@/components/Utils/Modals/ConfirmModal';
import FileUploadButton from '@/components/Utils/FileUpload';
import FileDownload from '@/components/Utils/FileDownload';
import CopyToClipboardBtn from '@/components/Utils/CopyToClipboardBtn';
import LspEditor from './LspEditor';
import Editor from './Editor';
import { additionalInputAreaUiMap, lspSupportMap } from '@/ToolMaps';

// Collaborative editing - lazy-loaded and gated behind env var
const COLLAB_ENABLED = import.meta.env.VITE_COLLAB_ENABLED === 'true';
const CollabToolbar = COLLAB_ENABLED
    ? React.lazy(() => import('@/collab/CollabToolbar'))
    : null;
const CollabEditorBridge = COLLAB_ENABLED
    ? React.lazy(() => import('@/collab/CollabEditorBridge'))
    : null;

interface InputAreaProps {
    editorTheme: string;
    onRunButtonClick: () => void;
    onFullScreenButtonClick: () => void;
}

const InputArea: React.FC<InputAreaProps> = ({ editorTheme, onRunButtonClick, onFullScreenButtonClick }) => {
    const location = useLocation();
    const [enableLsp, setEnableLsp] = useAtom(enableLspAtom);
    const [editorValue, setEditorValue] = useAtom(editorValueAtom);
    const [, setOutput] = useAtom(outputAtom);
    const [permalink, setPermalink] = useAtom(permalinkAtom);
    const [language] = useAtom(languageAtom);
    const [isExecuting] = useAtom(isExecutingAtom);
    const [isFullScreen] = useAtom(isFullScreenAtom);
    const [lineToHighlight, setLineToHighlight] = useAtom(lineToHighlightAtom);
    const [, setIsDiffViewMode] = useAtom(isDiffViewModeAtom);
    const [, setOriginalCode] = useAtom(originalCodeAtom);

    const [isNewSpecModalOpen, setIsNewSpecModalOpen] = useState(false); // state to control the new spec modal
    const [isMobile, setIsMobile] = useState(false);

    // Track the active Monaco editor instance for collab binding
    const activeEditorRef = useRef<any>(null);
    const activeMonacoRef = useRef<any>(null);
    const [editorInstanceKey, setEditorInstanceKey] = useState(0);

    const handleBasicEditorReady = (editor: any, monaco: any) => {
        activeEditorRef.current = editor;
        activeMonacoRef.current = monaco;
        setEditorInstanceKey((prev) => prev + 1);
    };

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

    const AdditionalUi = additionalInputAreaUiMap[language.short];

    // Check if current language supports LSP using the configuration from ToolMaps
    const isLspSupported = lspSupportMap[language.short] ?? false;

    // Keep LspEditor mounted permanently once first used, to preserve
    // the global monaco-vscode-api state that can't be re-initialized.
    // When a non-LSP tool is selected, LspEditor is hidden (not unmounted)
    // and receives the last LSP-supported language to avoid re-initialization.
    const lastLspLanguageRef = useRef(isLspSupported ? language : null);
    const lspMountedRef = useRef(false);
    if (enableLsp && isLspSupported) {
        lastLspLanguageRef.current = language;
        lspMountedRef.current = true;
    }
    const shouldShowLsp = enableLsp && isLspSupported;

    // Calculate editor height based on screen size and fullscreen state
    const getEditorHeight = () => {
        if (isFullScreen) {
            return isMobile ? '70vh' : '80vh';
        }
        return isMobile ? '40vh' : '60vh';
    };

    const openModal = () => setIsNewSpecModalOpen(true); // open the new spec modal
    const closeModal = () => setIsNewSpecModalOpen(false); // close the new spec modal

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

    const handleFileUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target) {
                const content = e.target.result as string;
                setEditorValue(content);
                // Reset permalink but keep the check status
                setPermalink((prev) => ({ ...prev, permalink: null }));
            }
        };
        reader.readAsText(file);
    };

    const handleDownload = () => {
        const content = editorValue;
        const queryParams = new URLSearchParams(location.search);
        const p = queryParams.get('p');
        const fileName = p ? p : 'code';
        const fileExtension = language.id ?? 'txt';
        return <FileDownload content={content} fileName={fileName} fileExtension={fileExtension} />;
    };

    const handleEnterDiffView = () => {
        // Store current code as original
        setOriginalCode(editorValue);
        // Enter diff view mode
        setIsDiffViewMode(true);
    };

    return (
        <div className='row'>
            <div className='col-md-12 mx-auto mb-2'>
                <div className='d-flex justify-content-between align-items-center'>
                    <div className='col-md-4'>
                        <h2>Input</h2>
                    </div>
                    <div>
                        <Stack direction='row' spacing={1}>
                            {isLspSupported && (
                                <>
                                    <span className='syntax-checking-span'>Syntax Checking</span>
                                    <MDBIcon
                                        size='lg'
                                        className='playground-icon'
                                        style={{ marginTop: '5px' }}
                                        data-tooltip-id='playground-tooltip'
                                        data-tooltip-content='This allows you to check the syntax of the code, get suggestions/code completion.'
                                    >
                                        <Toggle
                                            id='cheese-status'
                                            defaultChecked={enableLsp}
                                            onChange={(e) => setEnableLsp(e.target.checked)}
                                        />
                                    </MDBIcon>
                                </>
                            )}
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
                            <MDBIcon
                                size='lg'
                                className='playground-icon'
                                data-tooltip-id='playground-tooltip'
                                data-tooltip-content='Upload file'
                            >
                                <FileUploadButton onFileSelect={handleFileUpload} />
                            </MDBIcon>
                            <>{handleDownload()}</>
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
                            <div
                                style={{
                                    padding: '3px',
                                    borderRadius: '6px',
                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
                                    boxShadow: '0 0 15px rgba(102, 126, 234, 0.5)',
                                }}
                            >
                                {/* TODO: Temporary highlight for new feature. Remove when no longer needed */}
                                <MDBIcon
                                    size='lg'
                                    className='playground-icon'
                                    data-tooltip-id='playground-tooltip'
                                    data-tooltip-content='Compare Specs (New Feature!)'
                                    onClick={handleEnterDiffView}
                                    style={{
                                        backgroundColor: editorTheme === 'vs-dark' ? '#1e1e1e' : '#ffffff',
                                        borderRadius: '4px',
                                        padding: '4px',
                                    }}
                                >
                                    <VscDiffSingle />
                                </MDBIcon>
                            </div>
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
                {CollabToolbar && (
                    <div className='d-flex justify-content-end mb-1'>
                        <Suspense fallback={null}>
                            <CollabToolbar />
                        </Suspense>
                    </div>
                )}
            </div>
            {lspMountedRef.current && (
                <div style={{ display: shouldShowLsp ? undefined : 'none' }}>
                    <LspEditor
                        height={getEditorHeight()}
                        editorTheme={editorTheme}
                        setEditorValue={setEditorValue}
                        editorValue={editorValue}
                        language={lastLspLanguageRef.current!}
                        lineToHighlight={lineToHighlight}
                        setLineToHighlight={setLineToHighlight}
                        onEditorReady={handleBasicEditorReady}
                    />
                </div>
            )}
            {!shouldShowLsp && (
                <Editor
                    height={getEditorHeight()}
                    editorTheme={editorTheme}
                    onEditorReady={handleBasicEditorReady}
                />
            )}

            {CollabEditorBridge && (
                <Suspense fallback={null}>
                    <CollabEditorBridge
                        getEditor={() => activeEditorRef.current}
                        getMonaco={() => activeMonacoRef.current}
                        editorInstanceKey={editorInstanceKey}
                    />
                </Suspense>
            )}

            <div className='additional-input-ui'>{AdditionalUi && <AdditionalUi />}</div>
            <MDBBtn
                className={`mx-auto my-3 ${isMobile ? 'mobile-run-button' : ''}`}
                style={{ width: '95%' }}
                color='primary'
                onClick={onRunButtonClick}
                disabled={isExecuting}
            >
                {isExecuting ? 'Running...' : 'RUN'}
            </MDBBtn>
        </div>
    );
};

export default InputArea;
