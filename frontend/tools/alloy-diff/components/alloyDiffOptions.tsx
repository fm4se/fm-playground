import { useEffect, useState } from 'react';
import Select, { SingleValue } from 'react-select';
import { useAtom, useAtomValue } from 'jotai';
import { 
    alloyDiffOptionsAtom, 
    alloyDiffCmd1Atom,
    alloyDiffCmd2Atom,
    diffComparisonCodeAtom,
    editorValueAtom,
    isDarkThemeAtom
} from '@/atoms';
import '@/../tools/alloy/components/AlloyCmdOptions.css';

const AlloyDiffOptions = () => {
    const isDarkTheme = useAtomValue(isDarkThemeAtom);
    const [alloyDiffOption, setAlloyDiffOption] = useAtom(alloyDiffOptionsAtom);
    
    const [cmd1, setCmd1] = useAtom(alloyDiffCmd1Atom);
    const [cmd2, setCmd2] = useAtom(alloyDiffCmd2Atom);
    
    const diffComparisonCode = useAtomValue(diffComparisonCodeAtom);
    const editorValue = useAtomValue(editorValueAtom);
    
    const [cmd1Options, setCmd1Options] = useState<{value: number; label: string}[]>([]);
    const [cmd2Options, setCmd2Options] = useState<{value: number; label: string}[]>([]);

    const options = [
        { value: 'common-witness', label: 'Common Witness' },
        { value: 'not-current-but-previous', label: 'Not Current But Previous' },
        { value: 'not-previous-but-current', label: 'Not Previous But Current' },
        { value: 'semantic-relation', label: 'Semantic Relation' },
    ];

    const getCommandOptions = (code: string) => {
        const lines = code.split('\n');
        const opts = [];
        // Matches an optional label, then run or check, then the rest
        const cmdRegex = /^(?:(\w+):\s*)?(run|check)\b(.*)/;
        
        opts.push({ value: -1, label: 'Global (All Commands)' });
        
        let cmdIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const match = line.match(cmdRegex);
            if (match) {
                const label = match[1] ? `${match[1]}: ${match[2]}${match[3]}` : line;
                opts.push({ value: cmdIndex, label: label });
                cmdIndex++;
            }
        }
        return opts;
    };

    useEffect(() => {
        if (diffComparisonCode) {
            setCmd1Options(getCommandOptions(diffComparisonCode));
        } else {
            setCmd1Options([{ value: -1, label: 'Global (All Commands)' }]);
        }
    }, [diffComparisonCode]);

    useEffect(() => {
        if (editorValue) {
            setCmd2Options(getCommandOptions(editorValue));
        } else {
            setCmd2Options([{ value: -1, label: 'Global (All Commands)' }]);
        }
    }, [editorValue]);

    const handleOptionChange = (selectedOption: SingleValue<{ value: string; label: string }>) => {
        if (selectedOption) {
            setAlloyDiffOption(selectedOption.value);
        }
    };

    const handleCmd1Change = (selectedOption: SingleValue<{ value: number; label: string }>) => {
        if (selectedOption) {
            setCmd1(selectedOption);
        }
    };

    const handleCmd2Change = (selectedOption: SingleValue<{ value: number; label: string }>) => {
        if (selectedOption) {
            setCmd2(selectedOption);
        }
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
                    <p className='alloy-dropdown-label'>Analysis:</p>
                    <div className='alloy-dropdown-select'>
                        <Select
                        className='basic-single react-select-container'
                        classNamePrefix='select'
                        value={options.find(o => o.value === alloyDiffOption) || options[0]}
                        defaultValue={options[0] || null}
                        isDisabled={false}
                        isLoading={false}
                        isClearable={false}
                        isRtl={false}
                        isSearchable={true}
                        options={options}
                        onChange={handleOptionChange}
                        menuPortalTarget={document.body}
                        styles={selectStyles}
                    />
                </div>
                </div>
                
                <div className='alloy-dropdown-item command-dropdown'>
                    <p className='alloy-dropdown-label'>Command 1 (Prev):</p>
                    <div className='alloy-dropdown-select'>
                        <Select
                            className='basic-single react-select-container'
                            classNamePrefix='select'
                            isDisabled={false}
                            isLoading={false}
                            isClearable={false}
                            isRtl={false}
                            isSearchable={true}
                            value={cmd1}
                            options={cmd1Options}
                            onChange={handleCmd1Change}
                            menuPortalTarget={document.body}
                            styles={selectStyles}
                        />
                    </div>
                </div>

                <div className='alloy-dropdown-item command-dropdown'>
                    <p className='alloy-dropdown-label'>Command 2 (Curr):</p>
                    <div className='alloy-dropdown-select'>
                        <Select
                            className='basic-single react-select-container'
                            classNamePrefix='select'
                            isDisabled={false}
                            isLoading={false}
                            isClearable={false}
                            isRtl={false}
                            isSearchable={true}
                            value={cmd2}
                            options={cmd2Options}
                            onChange={handleCmd2Change}
                            menuPortalTarget={document.body}
                            styles={selectStyles}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AlloyDiffOptions;
