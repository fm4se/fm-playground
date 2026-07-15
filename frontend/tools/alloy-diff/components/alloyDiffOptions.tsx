import Select, { SingleValue } from 'react-select';
import { useAtom } from 'jotai';
import { alloyDiffOptionsAtom, isDarkThemeAtom } from '@/atoms';

const AlloyDiffOptions = () => {
    const [isDarkTheme] = useAtom(isDarkThemeAtom);
    const options = [
        { value: 'SemDiff', label: 'Semantic Difference' },
        { value: 'CommonInst', label: 'Common Instance' },
        { value: 'Equivalence', label: 'Equivalence Check' },
    ];
    const [, setAlloyDiffOption] = useAtom(alloyDiffOptionsAtom);

    const handleOptionChange = (selectedOption: SingleValue<{ value: string; label: string }>) => {
        if (selectedOption) {
            setAlloyDiffOption(selectedOption.value);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '5px' }}>
                <p style={{ marginRight: '10px', marginTop: '5px' }}>Analysis:</p>
                <div style={{ width: '70%' }}>
                    <Select
                        className='basic-single react-select-container'
                        classNamePrefix='select'
                        defaultValue={options[0] || null}
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
        </div>
    );
};

export default AlloyDiffOptions;
