import { useEffect } from 'react';
import Select, { SingleValue } from 'react-select';
import { useAtom } from 'jotai';
import { currentEditorValueAtom, alloySelectedCmdAtom, alloyCmdOptionsAtom } from '@/atoms';

const AlloyCmdOptions = () => {
    const [editorValue] = useAtom(currentEditorValueAtom);
    const [, setAlloySelectedCmd] = useAtom(alloySelectedCmdAtom);
    const [alloyCmdOption, setAlloyCmdOption] = useAtom(alloyCmdOptionsAtom);

    const findIndexByValue = (cmdOptionValue: number) => {
        return alloyCmdOption.findIndex((option) => option.value === cmdOptionValue);
    };

    useEffect(() => {
        if (editorValue) {
            const lines = editorValue.split('\n');
            const options = [];
            const labelRegex = /^(\w+):\s*(run|check)\s+(\w+)/;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('run') || line.startsWith('check')) {
                    const option = line;
                    options.push({ value: i, label: option });
                }
                // If there is a label, we need to add the label to the command
                else if (labelRegex.test(line)) {
                    const match = line.match(labelRegex);

                    if (match) {
                        const option = `${match[2]} ${match[1]} ${line.slice(match[0].length)}`;
                        options.push({ value: i, label: option });
                    }
                }
            }

            setAlloyCmdOption(options);
        }
    }, [editorValue]);

    const handleOptionChange = (selectedOption: SingleValue<{ value: number; label: string }>) => {
        if (selectedOption) {
            setAlloySelectedCmd(findIndexByValue(selectedOption.value));
        }
    };

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                marginTop: '15px',
            }}
        >
            <p style={{ marginRight: '10px', marginTop: '5px' }}>Command:</p>
            <div style={{ width: '70%' }}>
                <Select
                    className='basic-single react-select-container'
                    classNamePrefix='select'
                    isDisabled={false}
                    isLoading={false}
                    isClearable={false}
                    isRtl={false}
                    isSearchable={true}
                    options={alloyCmdOption}
                    onChange={handleOptionChange}
                    menuPortalTarget={document.body}
                    styles={{
                        menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                    }}
                />
            </div>
        </div>
    );
};

export default AlloyCmdOptions;
