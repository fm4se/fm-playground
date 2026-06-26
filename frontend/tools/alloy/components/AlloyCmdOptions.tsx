import { useEffect } from 'react';
import Select, { SingleValue } from 'react-select';
import { useAtom, useAtomValue } from 'jotai';
import { alloyCliOptionsAtom, alloyCmdOptionsAtom, alloySelectedCmdAtom, editorValueAtom, isDarkThemeAtom } from '@/atoms';
import './AlloyCmdOptions.css';

export const AlloyCmdOptions = () => {
    const [alloyCmdOption, setAlloyCmdOption] = useAtom(alloyCmdOptionsAtom);
    const [alloyCliOption, setAlloyCliOption] = useAtom(alloyCliOptionsAtom);
    const [alloySelectedCmd, setAlloySelectedCmd] = useAtom(alloySelectedCmdAtom);
    const editorValue = useAtomValue(editorValueAtom);
    const isDarkTheme = useAtomValue(isDarkThemeAtom);

    const actionOptions = [
        { value: 'execute-alloy', label: 'Execute Alloy' },
        { value: 'check-redundancy', label: 'Check Redundancy' },
        { value: 'explain-redundancy', label: 'Explain Redundancy' },
    ];

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

    const handleModeChange = (selectedMode: SingleValue<{ value: string; label: string }>) => {
        if (selectedMode) {
            setAlloyCliOption(selectedMode);
            if (selectedMode.value === 'check-redundancy' || selectedMode.value === 'explain-redundancy') {
                setAlloySelectedCmd(-1);
            } else if (alloySelectedCmd === -1) {
                setAlloySelectedCmd(0);
            }
        }
    };

    const handleCommandChange = (selectedOption: SingleValue<{ value: number; label: string }>) => {
        if (selectedOption) {
            if (selectedOption.value === -1) {
                setAlloySelectedCmd(-1);
            } else {
                setAlloySelectedCmd(findIndexByValue(selectedOption.value));
            }
        }
    };

    const displayedCmdOptions =
        alloyCliOption.value === 'check-redundancy' || alloyCliOption.value === 'explain-redundancy'
            ? [{ value: -1, label: 'Global (All Commands)' }, ...alloyCmdOption]
            : alloyCmdOption;

    const getCurrentCommandOption = () => {
        if (alloySelectedCmd === -1 && (alloyCliOption.value === 'check-redundancy' || alloyCliOption.value === 'explain-redundancy')) {
            return { value: -1, label: 'Global (All Commands)' };
        }
        if (alloySelectedCmd >= 0 && alloySelectedCmd < alloyCmdOption.length) {
            return alloyCmdOption[alloySelectedCmd];
        }
        return displayedCmdOptions[0] || null;
    };

    const selectStyles = {
        menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
        control: (base: any, state: any) => ({
            ...base,
            backgroundColor: isDarkTheme ? '#1e1e1e' : base.backgroundColor,
            borderColor: isDarkTheme ? '#464647' : base.borderColor,
            color: isDarkTheme ? '#d4d4d4' : base.color,
            '&:hover': {
                borderColor: isDarkTheme ? '#0d6efd' : base.borderColor,
            },
            boxShadow: state.isFocused
                ? isDarkTheme
                    ? '0 0 0 1px #0d6efd'
                    : base.boxShadow
                : base.boxShadow,
        }),
        menu: (base: any) => ({
            ...base,
            backgroundColor: isDarkTheme ? '#1e1e1e' : base.backgroundColor,
            border: isDarkTheme ? '1px solid #464647' : base.border,
        }),
        option: (base: any, state: any) => ({
            ...base,
            backgroundColor: state.isSelected
                ? isDarkTheme
                    ? '#0d6efd'
                    : base.backgroundColor
                : state.isFocused
                  ? isDarkTheme
                      ? '#2d2d30'
                      : base.backgroundColor
                  : isDarkTheme
                    ? '#1e1e1e'
                    : base.backgroundColor,
            color: isDarkTheme ? '#d4d4d4' : base.color,
            '&:hover': {
                backgroundColor: isDarkTheme ? '#2d2d30' : base.backgroundColor,
            },
        }),
        singleValue: (base: any) => ({
            ...base,
            color: isDarkTheme ? '#d4d4d4' : base.color,
        }),
        input: (base: any) => ({
            ...base,
            color: isDarkTheme ? '#d4d4d4' : base.color,
        }),
        placeholder: (base: any) => ({
            ...base,
            color: isDarkTheme ? '#6c757d' : base.color,
        }),
    };

    return (
        <div style={{ marginTop: '15px' }}>
            <div className='alloy-dropdowns-row'>
                <div className='alloy-dropdown-item action-dropdown'>
                    <p className='alloy-dropdown-label'>Action:</p>
                    <div className='alloy-dropdown-select'>
                        <Select
                            className='basic-single react-select-container'
                            classNamePrefix='select'
                            isDisabled={false}
                            isLoading={false}
                            isClearable={false}
                            isRtl={false}
                            isSearchable={true}
                            value={alloyCliOption}
                            options={actionOptions}
                            onChange={handleModeChange}
                            menuPortalTarget={document.body}
                            styles={selectStyles}
                        />
                    </div>
                </div>
                <div className='alloy-dropdown-item command-dropdown'>
                    <p className='alloy-dropdown-label'>Command:</p>
                    <div className='alloy-dropdown-select'>
                        <Select
                            className='basic-single react-select-container'
                            classNamePrefix='select'
                            isDisabled={false}
                            isLoading={false}
                            isClearable={false}
                            isRtl={false}
                            isSearchable={true}
                            value={getCurrentCommandOption()}
                            options={displayedCmdOptions}
                            onChange={handleCommandChange}
                            menuPortalTarget={document.body}
                            styles={selectStyles}
                        />
                    </div>
                </div>
            </div>
            {alloyCliOption?.value === 'explain-redundancy' && (
                <div
                    className='alloy-explain-hint'
                    style={{
                        color: isDarkTheme ? '#d4d4d4' : '#6c757d',
                    }}
                >
                    Place your cursor on any constraint line to explain why it's redundant
                </div>
            )}
        </div>
    );
};

export default AlloyCmdOptions;
