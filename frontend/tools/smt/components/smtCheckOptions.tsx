import Select, { SingleValue } from 'react-select';
import { useAtom } from 'jotai';
import { smtCliOptionsAtom, isDarkThemeAtom } from '@/atoms';

const SmtCheckOptions = () => {
    const options = [
        { value: 'execute-z3', label: 'Execute SMT' },
        { value: 'check-redundancy', label: 'Check Redundancy' },
        { value: 'explain-redundancy', label: 'Explain Redundancy' },
        { value: 'iterate-models', label: 'Iterate Models' },
    ];
    const [smtCheckOption, setSmtCheckOption] = useAtom(smtCliOptionsAtom);
    const [isDarkTheme] = useAtom(isDarkThemeAtom);

    const handleOptionChange = (selectedOption: SingleValue<{ value: string; label: string }>) => {
        if (selectedOption) {
            setSmtCheckOption(selectedOption);
        }
    };

    return (
        <div style={{ marginTop: '15px' }}>
            {smtCheckOption?.value === 'explain-redundancy' && (
                <div
                    style={{
                        marginBottom: '5px',
                        fontSize: '0.85em',
                        color: isDarkTheme ? '#fefefeff' : '#808080ff',
                        fontStyle: 'italic',
                        textAlign: 'center',
                    }}
                >
                    Place your cursor on an assertion line or select an assertion to explain why it's redundant
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <p style={{ marginRight: '10px', marginTop: '5px' }}>Check:</p>
                <div style={{ width: '50%' }}>
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

export default SmtCheckOptions;
