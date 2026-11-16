import { MDBFooter } from 'mdb-react-ui-kit';
import '@/assets/style/Footer.css';

const Footer = () => {
    return (
        <div aria-hidden='true'>
            <MDBFooter className='text-center text-lg-left mt-5'>
                <div className='text-center p-3 footer-text'>
                    Privacy Policy: This website logs the specifications, options, and anonymous editor interaction
                    statistics, which may be analyzed and made public for research purposes. Do not share confidential
                    information.
                    Unless you login, it does not collect any personally identifiable information. Deleting your profile
                    will remove all records of your profile from our servers. The specifications will be unlinked from
                    your profile, but remain on the servers (see first bullet).
                    <br />
                    &copy; {new Date().getFullYear()} Copyright: Made with ♥ in Bauhaus-Universität Weimar
                    <br />
                    <a
                        href={`https://github.com/fm4se/fm-playground/releases/tag/v${import.meta.env.VITE_FMP_VERSION}`}
                        target='_blank'
                        rel='noopener noreferrer'
                    >
                        v{import.meta.env.VITE_FMP_VERSION}
                    </a>
                </div>
            </MDBFooter>
        </div>
    );
};

export default Footer;
