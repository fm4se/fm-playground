import React from 'react';
import { useAtom } from 'jotai';
import { languageAtom } from '@/atoms';
import { diffToolOutputUIMap } from '@/ToolMaps';
import '@/assets/style/Playground.css';

interface DiffOutputProps {
    editorTheme: string;
    onFullScreenButtonClick?: () => void;
}

const DiffOutput: React.FC<DiffOutputProps> = ({ editorTheme }) => {
    const [language] = useAtom(languageAtom);

    const AdditionalUi = diffToolOutputUIMap[language.short];

    const isDark = editorTheme === 'vs-dark';
    const backgroundColor = isDark ? '#1e1e1e' : '#ffffff';
    return (
        <div
            style={{
                flex: 1,
                backgroundColor,
                borderRadius: '4px',
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
            }}
        >
            <div className='col-md-12'>
                <div>{AdditionalUi && <AdditionalUi />}</div>
            </div>
        </div>
    );
};

export default DiffOutput;
