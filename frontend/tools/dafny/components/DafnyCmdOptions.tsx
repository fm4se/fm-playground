import Select from 'react-select';
import { useAtom } from 'jotai';
import { dafnyCliOptionsAtom, isDarkThemeAtom } from '@/atoms';

const DafnyCliOptions = () => {
    const [, setDafnyCliOption] = useAtom(dafnyCliOptionsAtom);
    const [isDarkTheme] = useAtom(isDarkThemeAtom);
    const options = [
        //['py', 'cs', 'java', 'go', 'js']
        { value: 'verify', label: 'Verify' },
        { value: 'run', label: 'Run' },
        { value: 'translate-cs', label: 'Translate to C#' },
        { value: 'translate-py', label: 'Translate to Python' },
        { value: 'translate-java', label: 'Translate to Java' },
        { value: 'translate-go', label: 'Translate to Go' },
        { value: 'translate-js', label: 'Translate to JavaScript' },
    ];

    const handleOptionChange = (selectedOption: { value: string; label: string } | null) => {
        if (selectedOption) {
            setDafnyCliOption(selectedOption);
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '15px' }}>
            <p style={{ marginRight: '10px', marginTop: '5px' }}>Command:</p>
            <div style={{ width: '70%' }}>
                <Select
                    className='basic-single react-select-container'
                    classNamePrefix='select'
                    defaultValue={options[0]}
                    isDisabled={false}
                    isLoading={false}
                    isClearable={false}
                    isRtl={false}
                    isSearchable={true}
                    options={options}
                    onChange={handleOptionChange}
                    menuPortalTarget={document.body}
                    styles={{
                        menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                        control: (base, state) => ({
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
                        menu: (base) => ({
                            ...base,
                            backgroundColor: isDarkTheme ? '#1e1e1e' : base.backgroundColor,
                            border: isDarkTheme ? '1px solid #464647' : base.border,
                        }),
                        option: (base, state) => ({
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
                        singleValue: (base) => ({
                            ...base,
                            color: isDarkTheme ? '#d4d4d4' : base.color,
                        }),
                        input: (base) => ({
                            ...base,
                            color: isDarkTheme ? '#d4d4d4' : base.color,
                        }),
                        placeholder: (base) => ({
                            ...base,
                            color: isDarkTheme ? '#6c757d' : base.color,
                        }),
                    }}
                />
            </div>
        </div>
    );
};

export default DafnyCliOptions;
