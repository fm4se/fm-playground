/**
 * useCollaboration — React hook for managing collaborative editing.
 *
 * This hook bridges CollabManager (Yjs/WebSocket) with the React
 * component tree and Jotai state. It provides methods to create/join/leave
 * sessions and automatically binds to the Monaco editor when available.
 */
import { useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import type * as monacoEditor from 'monaco-editor';
import { CollabManager } from './CollabManager';
import { MonacoCollabBinding } from './MonacoCollabBinding';
import {
    collabSessionIdAtom,
    collabConnectedAtom,
    collabUsersAtom,
    collabLoadingAtom,
    collabErrorAtom,
} from './collabAtoms';
import type { CollabUser } from './collabAtoms';
import { jotaiStore, editorValueAtom } from '@/atoms';

const COLLAB_WS_URL = import.meta.env.VITE_COLLAB_WS_URL || 'ws://localhost:4444';

// --- Singletons ---
// We must share the same manager and binding across all components
// (Toolbar, EditorBridge) so they operate on the same Yjs document.
let globalCollabManager: CollabManager | null = null;
let globalBinding: MonacoCollabBinding | null = null;

function getManager(): CollabManager {
    if (!globalCollabManager) {
        globalCollabManager = new CollabManager({
            wsUrl: COLLAB_WS_URL,
            onConnectionChange: (isConnected) => {
                jotaiStore.set(collabConnectedAtom, isConnected);
                if (isConnected) {
                    jotaiStore.set(collabLoadingAtom, false);
                    jotaiStore.set(collabErrorAtom, null);
                }
            },
            onAwarenessChange: (remoteUsers) => {
                jotaiStore.set(
                    collabUsersAtom,
                    remoteUsers.map((u) => ({
                        clientId: u.clientId,
                        name: u.name,
                        color: u.color,
                        cursor: u.cursor,
                        selection: u.selection,
                    }))
                );
            },
        });
    }
    return globalCollabManager;
}

/**
 * Hook return type
 */
export interface UseCollaborationReturn {
    /** Current session code (null if not in a session) */
    sessionId: string | null;
    /** Whether connected to the collab server */
    connected: boolean;
    /** Remote users in the session */
    users: CollabUser[];
    /** Loading state */
    loading: boolean;
    /** Error message */
    error: string | null;
    /** Create a new session — returns the generated code */
    createSession: () => string;
    /** Join an existing session by code */
    joinSession: (code: string) => void;
    /** Leave the current session */
    leaveSession: () => void;
    /** Bind a Monaco editor to the current Yjs session */
    bindEditor: (
        editor: monacoEditor.editor.IStandaloneCodeEditor,
        model: monacoEditor.editor.ITextModel,
        monacoModule: typeof monacoEditor
    ) => void;
    /** Unbind the current Monaco editor */
    unbindEditor: () => void;
}

export function useCollaboration(): UseCollaborationReturn {
    const [sessionId, setSessionId] = useAtom(collabSessionIdAtom);
    const [connected] = useAtom(collabConnectedAtom);
    const [users] = useAtom(collabUsersAtom);
    const [loading, setLoading] = useAtom(collabLoadingAtom);
    const [error, setError] = useAtom(collabErrorAtom);

    // Initialize manager if not already done
    useEffect(() => {
        getManager();
        return () => {
            // We don't destroy the singleton manager on unmount because 
            // the toolbar and bridge might mount/unmount independently.
            // The manager is cleaned up explicitly on leaveSession.
        };
    }, []);

    /** Create a new collaboration session */
    const createSession = useCallback((): string => {
        const manager = getManager();
        setLoading(true);
        setError(null);

        // Get current editor content to seed the room
        const currentContent = jotaiStore.get(editorValueAtom) || '';

        // Clean up any existing binding
        if (globalBinding) {
            globalBinding.destroy();
            globalBinding = null;
        }

        const code = manager.createSession(currentContent);
        setSessionId(code);
        return code;
    }, [setSessionId, setLoading, setError]);

    /** Join an existing session by code */
    const joinSession = useCallback(
        (code: string): void => {
            const manager = getManager();

            if (!code || code.trim().length < 4) {
                setError('Please enter a valid session code (4-6 characters)');
                return;
            }

            setLoading(true);
            setError(null);

            // Clean up any existing binding
            if (globalBinding) {
                globalBinding.destroy();
                globalBinding = null;
            }

            manager.joinSession(code);
            setSessionId(code.toUpperCase().trim());
        },
        [setSessionId, setLoading, setError]
    );

    /** Leave the current session */
    const leaveSession = useCallback((): void => {
        // Clean up binding first
        if (globalBinding) {
            globalBinding.destroy();
            globalBinding = null;
        }

        // Then disconnect manager
        if (globalCollabManager) {
            globalCollabManager.disconnect();
        }

        setSessionId(null);
        jotaiStore.set(collabConnectedAtom, false);
        jotaiStore.set(collabUsersAtom, []);
        setLoading(false);
        setError(null);
    }, [setSessionId, setLoading, setError]);

    /** Bind a Monaco editor instance to the Yjs document */
    const bindEditor = useCallback(
        (
            editor: monacoEditor.editor.IStandaloneCodeEditor,
            model: monacoEditor.editor.ITextModel,
            monacoModule: typeof monacoEditor
        ): void => {
            const manager = getManager();

            const ytext = manager.getYText();
            if (!ytext) return;

            // Destroy previous binding if exists
            if (globalBinding) {
                globalBinding.destroy();
            }

            // Create new binding
            globalBinding = new MonacoCollabBinding(
                ytext,
                editor,
                model,
                manager.getAwareness(),
                monacoModule
            );
        },
        []
    );

    /** Unbind the current editor */
    const unbindEditor = useCallback((): void => {
        if (globalBinding) {
            globalBinding.destroy();
            globalBinding = null;
        }
    }, []);

    return {
        sessionId,
        connected,
        users,
        loading,
        error,
        createSession,
        joinSession,
        leaveSession,
        bindEditor,
        unbindEditor,
    };
}
