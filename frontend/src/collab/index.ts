/**
 * Collab module barrel export.
 *
 * Re-exports everything needed by the rest of the app.
 * This is the single entry point for all collab functionality.
 */
export { CollabManager, generateSessionCode } from './CollabManager';
export { MonacoCollabBinding } from './MonacoCollabBinding';
export { useCollaboration } from './useCollaboration';
export type { UseCollaborationReturn } from './useCollaboration';
export { default as CollabToolbar } from './CollabToolbar';
export {
    collabSessionIdAtom,
    collabConnectedAtom,
    collabUsersAtom,
    collabLoadingAtom,
    collabErrorAtom,
    collabJoinModalOpenAtom,
} from './collabAtoms';
export type { CollabUser } from './collabAtoms';
