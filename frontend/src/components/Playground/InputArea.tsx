import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAtom } from 'jotai';
import { Stack } from '@mui/material';
import { MDBBtn, MDBIcon } from 'mdb-react-ui-kit';
import { FaFileCirclePlus } from 'react-icons/fa6';
import { AiOutlineFullscreen, AiOutlineFullscreenExit } from 'react-icons/ai';
import Toggle from 'react-toggle';
import {
    enableLspAtom,
    outputAtom,
    permalinkAtom,
    languageAtom,
    isExecutingAtom,
    isFullScreenAtom,
    lineToHighlightAtom,
    currentEditorValueAtom,
} from '@/atoms';
import ConfirmModal from '@/components/Utils/Modals/ConfirmModal';
import FileUploadButton from '@/components/Utils/FileUpload';
import FileDownload from '@/components/Utils/FileDownload';
import CopyToClipboardBtn from '@/components/Utils/CopyToClipboardBtn';
import LspEditor from './LspEditor';
import Editor from './Editor';
import { additionalInputAreaUiMap, lspSupportMap } from '@/ToolMaps';

interface InputAreaProps {
    editorTheme: string;
    onRunButtonClick: () => void;
    onFullScreenButtonClick: () => void;
}

const InputArea: React.FC<InputAreaProps> = ({ editorTheme, onRunButtonClick, onFullScreenButtonClick }) => {
    const location = useLocation();
    const [enableLsp, setEnableLsp] = useAtom(enableLspAtom);
    const [editorValue, setEditorValue] = useAtom(currentEditorValueAtom);
    const [, setOutput] = useAtom(outputAtom);
    const [permalink, setPermalink] = useAtom(permalinkAtom);
    const [language] = useAtom(languageAtom);
    const [isExecuting] = useAtom(isExecutingAtom);
    const [isFullScreen] = useAtom(isFullScreenAtom);
    const [lineToHighlight, setLineToHighlight] = useAtom(lineToHighlightAtom);

    const [isNewSpecModalOpen, setIsNewSpecModalOpen] = useState(false); // state to control the new spec modal
    const [isMobile, setIsMobile] = useState(false);

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
                                <FaFileCirclePlus className='playground-icon' role='button' />
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
            </div>
            {enableLsp && isLspSupported ? (
                <LspEditor
                    height={getEditorHeight()}
                    editorTheme={editorTheme}
                    setEditorValue={setEditorValue}
                    editorValue={editorValue}
                    language={language}
                    lineToHighlight={lineToHighlight}
                    setLineToHighlight={setLineToHighlight}
                />
            ) : (
                <Editor height={getEditorHeight()} editorTheme={editorTheme} />
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
