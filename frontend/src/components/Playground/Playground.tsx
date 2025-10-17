import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtom } from 'jotai';
import { Tooltip } from 'react-tooltip';
import Tools from '@/components/Playground/Tools';
import Guides from '@/components/Utils/Guides';
import MessageModal from '@/components/Utils/Modals/MessageModal';
import { getCodeByParmalink } from '@/api/playgroundApi';
import { fmpConfig, toolExecutionMap } from '@/ToolMaps';
import Feedback from '@/components/Utils/Feedback';
import {
    currentEditorValueAtom,
    languageAtom,
    permalinkAtom,
    isExecutingAtom,
    outputAtom,
    isFullScreenAtom,
    isLoadingPermalinkAtom,
} from '@/atoms';
import InputArea from '@/components/Playground/InputArea';
import OutputArea from '@/components/Playground//OutputArea';
import ResizableSplitter from '@/components/Utils/ResizableSplitter';
import '@/assets/style/Playground.css';

import type { LanguageProps } from './Tools';

interface PlaygroundProps {
    editorTheme: string;
}

const Playground: React.FC<PlaygroundProps> = ({ editorTheme }) => {
    const navigate = useNavigate();
    const inputDivRef = useRef<HTMLDivElement>(null); // contains the reference to the editor area
    const outputDivRef = useRef<HTMLDivElement>(null); // contains the reference to the output area
    const [, setEditorValue] = useAtom(currentEditorValueAtom);
    const [language, setLanguage] = useAtom(languageAtom);
    const [permalink, setPermalink] = useAtom(permalinkAtom);
    const [, setOutput] = useAtom(outputAtom); // contains the output from the tool execution.
    const [, setIsExecuting] = useAtom(isExecutingAtom); // contains the state of the tool execution.
    const [, setIsFullScreen] = useAtom(isFullScreenAtom); // contains the state of the full screen mode.
    const [, setIsLoadingPermalink] = useAtom(isLoadingPermalinkAtom); // contains the state of loading permalink.
    const [errorMessage, setErrorMessage] = useState<string | null>(null); // contains the error messages from the API.
    const [isErrorMessageModalOpen, setIsErrorMessageModalOpen] = useState(false); // contains the state of the message modal.
    const [showFeedback, setShowFeedback] = useState<boolean>(false);

    const toggleFeedbackForm = () => {
        setShowFeedback((prev) => !prev);
    };

    /**
     * Load the code and language from the URL.
     */
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        let checkParam = urlParams.get('check');
        if (checkParam === 'VAL' || checkParam === 'QBF') {
            checkParam = 'SAT';
        } // v2.0.0: VAL and QBF are merged into SAT

        const permalinkParam = urlParams.get('p');

        const options = Object.entries(fmpConfig.tools).map(([key, tool]) => ({
            id: key,
            value: tool.extension,
            label: tool.name,
            short: tool.shortName,
        }));

        const selectedOption = options.find((option) => option.short === checkParam);

        // Update the selected language if 'check' parameter is present firstAdd commentMore actions
        if (selectedOption) {
            setLanguage(selectedOption);
        }
        // Load the code if 'check' parameter is present
        if (permalinkParam) {
            if (checkParam && permalinkParam) {
                setIsLoadingPermalink(true);
                loadCode(checkParam, permalinkParam);
            }
            setPermalink({ check: checkParam, permalink: permalinkParam });
        }
    }, []);

    /**
     * Update the URL when permalink changes.
     */
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const checkParam = urlParams.get('check') ? urlParams.get('check') : language.short;
        // Update the URL when permalink changes
        navigate(permalink.permalink ? `/?check=${permalink.check}&p=${permalink.permalink}` : `/?check=${checkParam}`);
    }, [permalink, navigate]);

    /**
     * Update the URL with ``check`` type when language changes.
     * @param {*} newLanguage
     */
    const handleLanguageChange = (newLanguage: LanguageProps) => {
        setLanguage(newLanguage);
        window.history.pushState(null, '', `?check=${newLanguage.short}`);
    };

    const loadCode = async (check: string, permalink: string) => {
        await getCodeByParmalink(check, permalink)
            .then((res) => {
                setEditorValue(res.code);
                setIsLoadingPermalink(false);
            })
            .catch((_err) => {
                alert('Permaling not found. Redirecting...');
                window.open(`/?check=SAT`, '_self');
                setIsLoadingPermalink(false);
            });
    };

    const handleToolExecution = async () => {
        setOutput('');
        try {
            setIsExecuting(true);
            const currentTool = toolExecutionMap[language.short];
            if (currentTool) {
                currentTool();
            } else {
                setIsExecuting(false);
            }
        } catch (err: any) {
            if (err.code === 'ERR_NETWORK') {
                showErrorModal('Network Error. Please check your internet connection.');
            } else if (err.response.status === 413) {
                showErrorModal('Code too long. Please reduce the size of the code.');
            } else {
                showErrorModal(
                    `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
                );
            }
        }
    };

    const toggleFullScreen = (div: 'input' | 'output') => {
        const element = { input: inputDivRef.current, output: outputDivRef.current }[div as 'input' | 'output'];
        const theme = localStorage.getItem('isDarkTheme') === 'true' ? 'dark' : 'light';
        if (!document.fullscreenElement) {
            // Enter fullscreen mode
            if (element?.requestFullscreen) {
                element.requestFullscreen();
            }
            document.documentElement.setAttribute('data-theme', theme);
            setIsFullScreen(true);
        } else {
            // Exit fullscreen mode
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
            document.documentElement.setAttribute('data-theme', theme);
            setIsFullScreen(false);
        }
    };

    /**
     * Add event listeners for full screen mode.
     * This is useful if the user presses the escape key to exit the full screen mode instead of clicking on the exit button.
     */
    useEffect(() => {
        const handleFullScreenChange = () => {
            setIsFullScreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullScreenChange);
        document.addEventListener('mozfullscreenchange', handleFullScreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
        document.addEventListener('msfullscreenchange', handleFullScreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullScreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullScreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
            document.removeEventListener('msfullscreenchange', handleFullScreenChange);
        };
    }, []);

    const showErrorModal = (message: string) => {
        setErrorMessage(message);
        setIsErrorMessageModalOpen(true);
    };

    const hideErrorModal = () => {
        setErrorMessage(null);
        setIsErrorMessageModalOpen(!isErrorMessageModalOpen);
    };

    return (
        <div className='container-fluid Playground'>
            <Tools onChange={handleLanguageChange} selected={language} />
            <Tooltip id='playground-tooltip' />
            <div className='row Playground'>
                <div className='col-12'>
                    <ResizableSplitter
                        leftChild={
                            <div ref={inputDivRef}>
                                <InputArea
                                    editorTheme={editorTheme}
                                    onRunButtonClick={handleToolExecution}
                                    onFullScreenButtonClick={() => toggleFullScreen('input')}
                                />
                            </div>
                        }
                        rightChild={
                            <div ref={outputDivRef}>
                                <OutputArea onFullScreenButtonClick={() => toggleFullScreen('output')} />
                            </div>
                        }
                        initialLeftWidth={50}
                        minLeftWidth={25}
                        maxLeftWidth={75}
                        resizerWidth={12}
                        breakpoint={768}
                    />
                </div>
            </div>
            <Guides id={language.id} />
            {errorMessage && (
                <MessageModal
                    isErrorMessageModalOpen={isErrorMessageModalOpen}
                    setIsErrorMessageModalOpen={hideErrorModal}
                    toggleErrorMessageModal={hideErrorModal}
                    title='Error'
                    errorMessage={errorMessage}
                />
            )}
            <button className='floating-button' onClick={toggleFeedbackForm}>
                Feedback
            </button>
            {showFeedback && <Feedback toggleFeedback={toggleFeedbackForm} />}
        </div>
    );
};

export default Playground;
