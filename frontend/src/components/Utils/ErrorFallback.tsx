import { isChunkLoadError } from '@/monitoring';

interface ErrorFallbackProps {
    error: unknown;
}

/**
 * Shown by the top-level error boundary instead of a blank page when rendering
 * fails. Kept dependency-free (no MUI/MDB, no context) so it still works when the
 * failure comes from one of those.
 */
const ErrorFallback = ({ error }: ErrorFallbackProps) => {
    const chunkError = isChunkLoadError(error);

    return (
        <div className='error-fallback' role='alert'>
            <h2>{chunkError ? 'A new version of FM Playground is available' : 'Something went wrong'}</h2>
            <p>
                {chunkError
                    ? 'Part of the page could not be loaded. Reloading will fetch the latest version.'
                    : 'The error has been reported. Reloading the page usually helps; your last saved specification is still available through its permalink.'}
            </p>
            <button type='button' onClick={() => window.location.reload()}>
                Reload page
            </button>
        </div>
    );
};

export default ErrorFallback;
