/**
 * Jotai atoms for collaborative editing state.
 * All collab-related state is isolated here so it can be
 * completely excluded when VITE_COLLAB_ENABLED !== 'true'.
 */
import { atom } from 'jotai';

/** Represents a remote collaborator visible via Yjs awareness */
export interface CollabUser {
    clientId: number;
    name: string;
    color: string;
    cursor: {
        lineNumber: number;
        column: number;
    } | null;
    selection: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
    } | null;
}

/** The current collaboration session code (e.g., "X7KM"), null when not in a session */
export const collabSessionIdAtom = atom<string | null>(null);

/** Whether we are currently connected to the collab WebSocket server */
export const collabConnectedAtom = atom<boolean>(false);

/** List of remote users in the current session (excludes local user) */
export const collabUsersAtom = atom<CollabUser[]>([]);

/** Whether a collab session is being created or joined (loading state) */
export const collabLoadingAtom = atom<boolean>(false);

/** Error message from collab operations */
export const collabErrorAtom = atom<string | null>(null);

/** Whether the Join modal is open */
export const collabJoinModalOpenAtom = atom<boolean>(false);
