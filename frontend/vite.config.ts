import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vsixPlugin from '@codingame/monaco-vscode-rollup-vsix-plugin';

export default defineConfig({
    legacy: {
        // Vite 8 changed CJS interop: default imports from CJS modules in ESM
        // packages now return module.exports instead of module.exports.default.
        // This restores the previous behavior for packages like react-toggle.
        inconsistentCjsInterop: true,
    },
    plugins: [
        {
            // Plugin code is from https://github.com/chaosprint/vite-plugin-cross-origin-isolation
            name: 'configure-response-headers',
            configureServer: (server) => {
                server.middlewares.use((_req, res, next) => {
                    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
                    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
                    next();
                });
            },
        },
        react(),
        vsixPlugin(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            onwarn(warning, warn) {
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
                    return;
                }
                warn(warning);
            },
        },
    },
    preview: {
        port: 5173,
        strictPort: true,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
            '/diff-limboole': {
                target: 'http://limboole-diff:8080',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/diff-limboole/, ''),
            },
            '/nuxmv': {
                target: 'http://nuxmv:8080',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/nuxmv/, ''),
            },
            '/smt': {
                target: 'http://smt-z3:8080',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/smt/, ''),
            },
            '/diff-smt': {
                target: 'http://smt-diff:8080',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/diff-smt/, ''),
            },
            '/alloy': {
                target: 'http://alloy:8080',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/alloy/, ''),
            },
            '/spectra': {
                target: 'http://spectra:8080',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/spectra/, ''),
            },
            '/dafny': {
                target: 'http://dafny-api:8080',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/dafny/, ''),
            },
            '/lsp-dafny': {
                target: 'ws://dafny-lsp:8080',
                changeOrigin: true,
                secure: false,
                ws: true,
                rewrite: (path) => path.replace(/^\/lsp-dafny/, ''),
            },
        },
    },
    server: {
        watch: {
            usePolling: true,
        },
        port: 5173,
        strictPort: true,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
            '/diff-limboole': {
                target: 'http://localhost:8051',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/diff-limboole/, ''),
            },
            '/nuxmv': {
                target: 'http://localhost:8081',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/nuxmv/, ''),
            },
            '/smt': {
                target: 'http://localhost:8082',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/smt/, ''),
            },
            '/diff-smt': {
                target: 'http://localhost:8052',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/diff-smt/, ''),
            },
            '/alloy': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/alloy/, ''),
            },
            '/spectra': {
                target: 'http://localhost:8083',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/spectra/, ''),
            },
            '/dafny': {
                target: 'http://localhost:8085',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/dafny/, ''),
            },
            '/lsp-dafny': {
                target: 'ws://localhost:8091',
                changeOrigin: true,
                secure: false,
                ws: true,
                rewrite: (path) => path.replace(/^\/lsp-dafny/, ''),
            },
        },
    },
    worker: {
        format: 'es',
    },
});
