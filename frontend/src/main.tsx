import './instrument';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@sentry/react';
import './assets/style/index.css';
import 'mdb-react-ui-kit/dist/css/mdb.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import App from './App.js';
import ErrorFallback from './components/Utils/ErrorFallback';

const rootElement = document.getElementById('root');
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            {/* Reports render errors and shows a reload screen instead of a blank page. */}
            <ErrorBoundary fallback={({ error }) => <ErrorFallback error={error} />}>
                <App />
            </ErrorBoundary>
        </React.StrictMode>
    );
} else {
    console.error('Root element not found');
}
