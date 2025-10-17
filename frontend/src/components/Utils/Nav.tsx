import React, { useContext, useState } from 'react';
import { useAtom } from 'jotai';
import {
    MDBNavbarBrand,
    MDBBtn,
    MDBDropdown,
    MDBDropdownMenu,
    MDBDropdownToggle,
    MDBDropdownItem,
} from 'mdb-react-ui-kit';
import { FaGithub } from 'react-icons/fa';
import { MdOutlineMenu } from 'react-icons/md';
import AuthContext from '@/contexts/AuthContext';
import DrawerComponent from '@/components/Utils/DrawerComponent';
import CustomSnackbar from '@/components/Utils/Modals/CustomSnackbar';
import ConfirmModal from '@/components/Utils/Modals/ConfirmModal';
import { downloadUserData, deleteProfile } from '@/api/playgroundApi';
import axiosAuth from '@/api/axiosAuth';
import SessionExpiredModal from '@/components/Utils/Modals//SessionExpiredModal';
import Toggle from '@/components/Utils/Toggle';
import { currentEditorValueAtom, languageAtom } from '@/atoms';
import { fmpConfig } from '@/ToolMaps';
import '@/assets/style/Nav.css';

interface NavbarProps {
    isDarkTheme: boolean;
    setIsDarkTheme: (value: boolean) => void;
}

const Navbar: React.FC<NavbarProps> = ({ isDarkTheme, setIsDarkTheme }) => {
    const [, setEditorValue] = useAtom(currentEditorValueAtom);
    const [, setLanguage] = useAtom(languageAtom);
    const authContext = useContext(AuthContext);
    const isLoggedIn = authContext?.isLoggedIn ?? false;
    const setIsLoggedIn = authContext?.setIsLoggedIn ?? (() => {});
    const [isDrawerOpen, setDrawerOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    function handleLogout() {
        axiosAuth
            .get(`${import.meta.env.VITE_FMP_API_URL}/logout`)
            .then((_res) => {
                setIsLoggedIn(false);
                setSnackbarMessage('Logout successful');
            })
            .catch((err) => {
                console.log(err);
            });
    }

    /**
     * Fetch the user history from the API.
     * @todo: This function is moved to DrawerComponent.jsx.  Remove this function if it's not used anywhere else.
     * @param {*} pageNumber
     */
    const handleUserDataDownload = async () => {
        try {
            await downloadUserData()
                .then((res) => {
                    const user = res.email;
                    const history = res.data;
                    const data = { user, history };
                    const url = window.URL.createObjectURL(new Blob([JSON.stringify(data)]));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `${user}.json`);
                    document.body.appendChild(link);
                    link.click();
                })
                .catch((err) => {
                    console.log(err);
                });
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const handleUserProfileDelete = async () => {
        try {
            await deleteProfile()
                .then((res) => {
                    console.log(res);
                    setIsLoggedIn(false);
                })
                .catch((err) => {
                    console.log(err);
                });
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const handleDrawerOpen = () => {
        setDrawerOpen(true);
    };

    const handleDrawerClose = () => {
        setDrawerOpen(false);
    };

    const handleSnackbarClose = () => {
        setSnackbarMessage('');
    };

    /**
     * Handle the drawer item click. Update the state in the Playground component to set the code in the Editor
     * @param {*} check  - The short name of the tool.
     * @param {*} permalink - The for the specification.
     * @param {*} code - Specification code.
     */
    const handleDrawerItemClick = (check: string, permalink: string, code: string) => {
        setEditorValue(code);
        const options = Object.entries(fmpConfig.tools).map(([key, tool]) => ({
            id: key,
            value: tool.extension,
            label: tool.name,
            short: tool.shortName,
        }));
        const selectedOption = options.find((option) => option.short === check);
        if (selectedOption) {
            setLanguage(selectedOption);
        }
        window.history.pushState(null, '', `/?check=${check}&p=${permalink}`);
        const info = document.getElementById('info');
        if (info) {
            info.innerText = '';
        }
    };

    const openModal = () => setIsModalOpen(true);
    const closeModal = () => setIsModalOpen(false);

    return (
        <div>
            <ConfirmModal
                isOpen={isModalOpen}
                onClose={closeModal}
                title='Delete Profile'
                message={`This is a destructive action. This will unlink all specifications from your history (this information will be lost forever).
        Are you sure you want to delete your profile?`}
                onConfirm={handleUserProfileDelete}
            />
            <SessionExpiredModal />
            <header className='header'>
                <MDBNavbarBrand className='d-flex align-items-center gap-2'>
                    <span>
                        <img className='nav-se-logo img-fluid' src='/logo_se.png' alt='SE Logo' />
                    </span>
                    <span className='text-lg font-weight-bold'>FM Playground</span>
                </MDBNavbarBrand>

                <div className='nav-right d-none d-lg-flex gap-2'>
                    {isLoggedIn ? (
                        <>
                            <MDBBtn
                                className='navbar-option-button'
                                onClick={handleDrawerOpen}
                                style={{ width: 'auto', display: 'flex', alignItems: 'center', height: '38px' }}
                            >
                                History
                            </MDBBtn>
                            <DrawerComponent
                                isOpen={isDrawerOpen}
                                onClose={handleDrawerClose}
                                onItemSelect={handleDrawerItemClick}
                            />
                            <MDBDropdown
                                className='btn-group navbar-option-button'
                                style={{ width: 'auto', display: 'flex', alignItems: 'center', height: '38px' }}
                            >
                                <MDBBtn color='danger' onClick={handleLogout} style={{ height: '38px' }}>
                                    Logout
                                </MDBBtn>
                                <MDBDropdownToggle
                                    split
                                    color='dark'
                                    style={{ flex: '0', height: '38px' }}
                                ></MDBDropdownToggle>
                                <MDBDropdownMenu style={{ minWidth: '200px' }}>
                                    <MDBDropdownItem link onClick={handleUserDataDownload}>
                                        Download Your Data
                                    </MDBDropdownItem>
                                    <MDBDropdownItem link onClick={openModal}>
                                        Delete Profile
                                    </MDBDropdownItem>
                                </MDBDropdownMenu>
                            </MDBDropdown>
                        </>
                    ) : (
                        <MDBBtn
                            rounded
                            color='primary'
                            href='/login'
                            style={{ height: '38px', display: 'flex', alignItems: 'center' }}
                        >
                            Login
                        </MDBBtn>
                    )}

                    <Toggle isDarkTheme={isDarkTheme} setIsDarkTheme={setIsDarkTheme} />
                    <button
                        className='github-icon-button'
                        onClick={() => window.open('https://github.com/fm4se/fm-playground', '_blank')}
                    >
                        <FaGithub size={20} />
                    </button>
                </div>

                {/* Dropdown visible on small screens, hidden on large */}
                <MDBDropdown className='d-lg-none'>
                    <MDBDropdownToggle color='light'>
                        <MdOutlineMenu />
                    </MDBDropdownToggle>
                    <MDBDropdownMenu style={{ textAlign: 'right' }}>
                        {isLoggedIn ? (
                            <MDBDropdownItem link onClick={handleDrawerOpen}>
                                History
                            </MDBDropdownItem>
                        ) : (
                            <></>
                        )}
                        {isLoggedIn ? (
                            <MDBDropdownItem link onClick={handleLogout}>
                                Logout
                            </MDBDropdownItem>
                        ) : (
                            <></>
                        )}
                        {isLoggedIn ? <MDBDropdownItem divider /> : <></>}
                        {isLoggedIn ? (
                            <MDBDropdownItem link onClick={handleUserDataDownload}>
                                Download Your Data
                            </MDBDropdownItem>
                        ) : (
                            <></>
                        )}
                        {isLoggedIn ? (
                            <MDBDropdownItem link onClick={openModal}>
                                Delete Profile
                            </MDBDropdownItem>
                        ) : (
                            <></>
                        )}

                        {!isLoggedIn ? (
                            <MDBDropdownItem link href='/login'>
                                Login
                            </MDBDropdownItem>
                        ) : (
                            <></>
                        )}
                        <MDBDropdownItem divider />
                        <MDBDropdownItem>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'end',
                                    alignItems: 'center',
                                    paddingBottom: '1em',
                                    paddingRight: '1em',
                                }}
                            >
                                <Toggle isDarkTheme={isDarkTheme} setIsDarkTheme={setIsDarkTheme} />
                                <button
                                    className='github-icon-button'
                                    onClick={() => window.open('https://github.com/fm4se/fm-playground', '_blank')}
                                    style={{ marginLeft: '0.5rem' }}
                                >
                                    <FaGithub size={20} />
                                </button>
                            </div>
                        </MDBDropdownItem>
                    </MDBDropdownMenu>
                </MDBDropdown>
            </header>

            <CustomSnackbar message={snackbarMessage} onClose={handleSnackbarClose} />
        </div>
    );
};

export default Navbar;
