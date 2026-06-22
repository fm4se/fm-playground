/**
 * CollabToolbar - UI component for collaborative editing controls.
 *
 * Renders:
 * - When not in a session: "Collaborate" and "Join" buttons
 * - When in a session: Session code badge, user count, user avatars, "Leave" button
 * - Join modal for entering a session code
 * - Created session modal showing the generated code
 */
import React, { useState, useRef, useEffect } from 'react';
import { useAtom } from 'jotai';
import { collabJoinModalOpenAtom } from './collabAtoms';
import { useCollaboration } from './useCollaboration';
import './collabStyles.css';

interface CollabToolbarProps {
    /** Callback when editor binding is needed (after create/join) */
    onSessionChange?: (active: boolean) => void;
}

const CollabToolbar: React.FC<CollabToolbarProps> = ({ onSessionChange }) => {
    const {
        sessionId,
        connected,
        users,
        loading,
        error,
        createSession,
        joinSession,
        leaveSession,
    } = useCollaboration();

    const [joinModalOpen, setJoinModalOpen] = useAtom(collabJoinModalOpenAtom);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [userName, setUserName] = useState(() => localStorage.getItem('collab-username') || '');
    const [showCreatedModal, setShowCreatedModal] = useState(false);
    const [createdCode, setCreatedCode] = useState('');
    const [copied, setCopied] = useState(false);
    const joinInputRef = useRef<HTMLInputElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const createNameInputRef = useRef<HTMLInputElement>(null);

    // Focus input when join modal opens
    useEffect(() => {
        if (joinModalOpen) {
            setTimeout(() => {
                if (userName) {
                    joinInputRef.current?.focus();
                } else {
                    nameInputRef.current?.focus();
                }
            }, 100);
        }
    }, [joinModalOpen]); // Removed userName from dependencies to fix focus stealing

    // Focus input when create modal opens
    useEffect(() => {
        if (createModalOpen && createNameInputRef.current) {
            setTimeout(() => createNameInputRef.current?.focus(), 100);
        }
    }, [createModalOpen]);

    // Notify parent when session changes
    useEffect(() => {
        onSessionChange?.(!!sessionId);
    }, [sessionId, onSessionChange]);

    const handleCreateSubmit = () => {
        if (userName.trim()) {
            localStorage.setItem('collab-username', userName.trim());
        }
        const code = createSession(userName);
        if (code) {
            setCreatedCode(code);
            setCreateModalOpen(false);
            setShowCreatedModal(true);
        }
    };

    const handleJoinSubmit = () => {
        if (joinCode.trim().length >= 4) {
            if (userName.trim()) {
                localStorage.setItem('collab-username', userName.trim());
            }
            joinSession(joinCode.trim(), userName);
            setJoinModalOpen(false);
            setJoinCode('');
        }
    };

    const handleLeave = () => {
        leaveSession();
        onSessionChange?.(false);
        setShowCreatedModal(false);
    };

    const handleCopyCode = async (code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback: select text
            const el = document.querySelector('.collab-created-code');
            if (el) {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(el);
                selection?.removeAllRanges();
                selection?.addRange(range);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, action: 'join' | 'create') => {
        if (e.key === 'Enter') {
            if (action === 'join') handleJoinSubmit();
            else handleCreateSubmit();
        } else if (e.key === 'Escape') {
            if (action === 'join') {
                setJoinModalOpen(false);
                setJoinCode('');
            } else {
                setCreateModalOpen(false);
            }
        }
    };

    // --- Render Modals ---
    const renderModals = () => (
        <>
            {/* Join Modal */}
            {joinModalOpen && (
                <div className='collab-modal-overlay' onClick={() => { setJoinModalOpen(false); setJoinCode(''); }}>
                    <div className='collab-modal' onClick={(e) => e.stopPropagation()}>
                        <div className='collab-modal-title'>Join Collaboration</div>
                        <div className='collab-modal-subtitle'>
                            Enter your name and the session code
                        </div>
                        <div className='collab-modal-inputs'>
                            <input
                                ref={nameInputRef}
                                className='collab-modal-input name-input'
                                type='text'
                                placeholder='Your Name'
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, 'join')}
                                maxLength={20}
                            />
                            <input
                                ref={joinInputRef}
                                className='collab-modal-input'
                                type='text'
                                placeholder='SESSION CODE'
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                                onKeyDown={(e) => handleKeyDown(e, 'join')}
                                maxLength={6}
                                autoComplete='off'
                                spellCheck={false}
                            />
                        </div>
                        {error && <div className='collab-modal-error'>{error}</div>}
                        <div className='collab-modal-actions'>
                            <button
                                className='collab-modal-cancel'
                                onClick={() => { setJoinModalOpen(false); setJoinCode(''); }}
                            >
                                Cancel
                            </button>
                            <button
                                className='collab-modal-join'
                                onClick={handleJoinSubmit}
                                disabled={joinCode.trim().length < 4 || !userName.trim()}
                            >
                                Join Session
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Session Modal */}
            {createModalOpen && (
                <div className='collab-modal-overlay' onClick={() => setCreateModalOpen(false)}>
                    <div className='collab-modal' onClick={(e) => e.stopPropagation()}>
                        <div className='collab-modal-title'>Start Collaboration</div>
                        <div className='collab-modal-subtitle'>
                            Enter your name to start a session
                        </div>
                        <input
                            ref={createNameInputRef}
                            className='collab-modal-input name-input'
                            type='text'
                            placeholder='Your Name'
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, 'create')}
                            maxLength={20}
                        />
                        <div className='collab-modal-actions'>
                            <button
                                className='collab-modal-cancel'
                                onClick={() => setCreateModalOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className='collab-modal-join'
                                onClick={handleCreateSubmit}
                                disabled={!userName.trim() || loading}
                            >
                                Create Session
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Created Session Modal */}
            {showCreatedModal && (
                <div className='collab-modal-overlay' onClick={() => setShowCreatedModal(false)}>
                    <div className='collab-modal' onClick={(e) => e.stopPropagation()}>
                        <div className='collab-modal-title'>Session Created!</div>
                        <div className='collab-modal-subtitle'>
                            Share this code with your collaborator
                        </div>
                        <div
                            className='collab-created-code'
                            onClick={() => handleCopyCode(createdCode)}
                            title='Click to copy'
                        >
                            {createdCode}
                        </div>
                        <div className='collab-created-hint'>Click the code to copy it</div>
                        {copied && <div className='collab-copied-toast'>Copied to clipboard!</div>}
                        <div className='collab-modal-actions'>
                            <button
                                className='collab-modal-join'
                                onClick={() => setShowCreatedModal(false)}
                                style={{ flex: 1 }}
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    // --- Active Session View ---
    if (sessionId) {
        return (
            <div className='collab-toolbar'>
                <div className='collab-session-badge'>
                    <span
                        className={`collab-status-dot ${loading ? 'loading' : connected ? 'connected' : 'disconnected'}`}
                    />
                    <span className='collab-session-code'>{sessionId}</span>
                    {users.length > 0 && (
                        <>
                            <span className='collab-user-count'>
                                · {users.length + 1}
                            </span>
                            <div className='collab-user-avatars'>
                                {users.slice(0, 3).map((user) => (
                                    <div
                                        key={user.clientId}
                                        className='collab-user-avatar'
                                        style={{ backgroundColor: user.color }}
                                        title={user.name}
                                    >
                                        {user.name.charAt(0)}
                                    </div>
                                ))}
                                {users.length > 3 && (
                                    <div
                                        className='collab-user-avatar'
                                        style={{ backgroundColor: '#888' }}
                                        title={`${users.length - 3} more`}
                                    >
                                        +{users.length - 3}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
                <button className='collab-btn collab-leave-btn' onClick={handleLeave} title='Leave collaboration session'>
                    Leave
                </button>
                {renderModals()}
            </div>
        );
    }

    // --- No Session View ---
    return (
        <div className='collab-toolbar'>
            <button
                className='collab-btn collab-start-btn'
                onClick={() => setCreateModalOpen(true)}
                disabled={loading}
                title='Start a new collaboration session'
            >
                <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                    <path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
                    <circle cx='9' cy='7' r='4' />
                    <path d='M23 21v-2a4 4 0 0 0-3-3.87' />
                    <path d='M16 3.13a4 4 0 0 1 0 7.75' />
                </svg>
                Collaborate
            </button>
            <button
                className='collab-btn collab-join-btn'
                onClick={() => setJoinModalOpen(true)}
                disabled={loading}
                title='Join an existing session'
            >
                Join
            </button>
            {renderModals()}
        </div>
    );
};


export default CollabToolbar;
