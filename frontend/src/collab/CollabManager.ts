/**
 * CollabManager — Core Yjs + WebSocket provider + awareness manager.
 *
 * This module manages the Yjs document, WebSocket connection, and
 * awareness protocol for collaborative editing. It is the single
 * source of truth for the collaboration state.
 *
 * It does NOT depend on React or Monaco directly — it exposes
 * observables and methods that the React hook and Monaco binding consume.
 */
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';

/** Random color palette for collaborator cursors */
const COLLAB_COLORS = [
    '#FF6B6B', // coral red
    '#4ECDC4', // teal
    '#45B7D1', // sky blue
    '#96CEB4', // sage green
    '#FFEAA7', // pale yellow
    '#DDA0DD', // plum
    '#98D8C8', // mint
    '#F7DC6F', // gold
    '#BB8FCE', // lavender
    '#85C1E9', // light blue
];

/** Generate a random 4-6 character alphanumeric code */
export function generateSessionCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
    const length = 4 + Math.floor(Math.random() * 3); // 4, 5, or 6
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

/** Get a deterministic color for a given client ID */
function getColorForClient(clientId: number): string {
    return COLLAB_COLORS[clientId % COLLAB_COLORS.length];
}

/** Generate a random anonymous name */
function generateAnonName(): string {
    const adjectives = ['Swift', 'Bold', 'Calm', 'Keen', 'Wise', 'Warm', 'Cool', 'Fair'];
    const animals = ['Fox', 'Owl', 'Cat', 'Bear', 'Wolf', 'Hawk', 'Deer', 'Lynx'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    return `${adj} ${animal}`;
}

export interface CollabManagerOptions {
    /** WebSocket server URL (e.g., ws://localhost:4444) */
    wsUrl: string;
    /** Callback when connection status changes */
    onConnectionChange?: (connected: boolean) => void;
    /** Callback when awareness (remote users) changes */
    onAwarenessChange?: (users: AwarenessUser[]) => void;
}

export interface AwarenessUser {
    clientId: number;
    name: string;
    color: string;
    cursor: { lineNumber: number; column: number } | null;
    selection: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
    } | null;
}

export class CollabManager {
    private ydoc: Y.Doc | null = null;
    private provider: WebsocketProvider | null = null;
    private awareness: Awareness | null = null;
    private wsUrl: string;
    private sessionCode: string | null = null;
    private localName: string;
    private localColor: string;
    private onConnectionChange?: (connected: boolean) => void;
    private onAwarenessChange?: (users: AwarenessUser[]) => void;
    private connected = false;

    constructor(options: CollabManagerOptions) {
        this.wsUrl = options.wsUrl;
        this.onConnectionChange = options.onConnectionChange;
        this.onAwarenessChange = options.onAwarenessChange;
        this.localName = generateAnonName();
        this.localColor = COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];
    }

    /** Get the Y.Text shared type for the editor content */
    getYText(): Y.Text | null {
        return this.ydoc?.getText('monaco') ?? null;
    }

    /** Get the awareness instance */
    getAwareness(): Awareness | null {
        return this.awareness;
    }

    /** Get the Yjs document */
    getYDoc(): Y.Doc | null {
        return this.ydoc;
    }

    /** Get current session code */
    getSessionCode(): string | null {
        return this.sessionCode;
    }

    /** Whether currently connected */
    isConnected(): boolean {
        return this.connected;
    }

    /** Get the local user's name */
    getLocalName(): string {
        return this.localName;
    }

    /** Get the local user's color */
    getLocalColor(): string {
        return this.localColor;
    }

    /**
     * Create a new collaboration session.
     * Generates a unique code and connects to the WebSocket server.
     * @param initialContent - The current editor content to seed the room with
     * @returns The generated session code
     */
    createSession(initialContent: string): string {
        this.disconnect();

        const code = generateSessionCode();
        this.sessionCode = code;

        this.ydoc = new Y.Doc();
        const ytext = this.ydoc.getText('monaco');

        // Pre-fill the Y.Text with current editor content
        // This will be synced to other clients when they join
        ytext.insert(0, initialContent);

        this.connectToRoom(code);
        return code;
    }

    /**
     * Join an existing collaboration session by code.
     * @param code - The session code to join
     */
    joinSession(code: string): void {
        this.disconnect();

        this.sessionCode = code.toUpperCase().trim();
        this.ydoc = new Y.Doc();

        // Don't pre-fill content — we'll receive it from the room
        this.connectToRoom(this.sessionCode);
    }

    /** Connect to a room on the WebSocket server */
    private connectToRoom(roomName: string): void {
        if (!this.ydoc) return;

        this.provider = new WebsocketProvider(this.wsUrl, roomName, this.ydoc, {
            connect: true,
            // Disable broadcast channel to avoid cross-tab interference
            disableBc: true,
        });

        this.awareness = this.provider.awareness;

        // Set local awareness state
        this.awareness.setLocalStateField('user', {
            name: this.localName,
            color: this.localColor,
        });

        // Listen for connection status changes
        this.provider.on('status', (event: { status: string }) => {
            const isConnected = event.status === 'connected';
            this.connected = isConnected;
            this.onConnectionChange?.(isConnected);
        });

        // Listen for awareness changes (remote cursors)
        this.awareness.on('change', () => {
            this.broadcastAwarenessUpdate();
        });
    }

    /** Broadcast awareness state to callback */
    private broadcastAwarenessUpdate(): void {
        if (!this.awareness) return;

        const states = this.awareness.getStates();
        const localClientId = this.ydoc?.clientID;
        const users: AwarenessUser[] = [];

        states.forEach((state, clientId) => {
            if (clientId === localClientId) return; // Skip self
            if (!state.user) return;

            users.push({
                clientId,
                name: state.user.name || `User ${clientId}`,
                color: state.user.color || getColorForClient(clientId),
                cursor: state.cursor ?? null,
                selection: state.selection ?? null,
            });
        });

        this.onAwarenessChange?.(users);
    }

    /** Update local cursor position in awareness */
    updateCursor(lineNumber: number, column: number): void {
        this.awareness?.setLocalStateField('cursor', { lineNumber, column });
    }

    /** Update local selection in awareness */
    updateSelection(
        startLineNumber: number,
        startColumn: number,
        endLineNumber: number,
        endColumn: number
    ): void {
        // Only set selection if it's a real selection (not just a cursor)
        if (startLineNumber === endLineNumber && startColumn === endColumn) {
            this.awareness?.setLocalStateField('selection', null);
        } else {
            this.awareness?.setLocalStateField('selection', {
                startLineNumber,
                startColumn,
                endLineNumber,
                endColumn,
            });
        }
    }

    /** Disconnect from the current session and clean up */
    disconnect(): void {
        if (this.provider) {
            this.provider.disconnect();
            this.provider.destroy();
            this.provider = null;
        }
        if (this.ydoc) {
            this.ydoc.destroy();
            this.ydoc = null;
        }
        this.awareness = null;
        this.sessionCode = null;
        this.connected = false;
        this.onConnectionChange?.(false);
        this.onAwarenessChange?.([]);
    }

    /** Clean up everything */
    destroy(): void {
        this.disconnect();
    }
}
