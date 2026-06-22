/**
 * This component listens for collab session changes and binds/unbinds
 * the Yjs document to whichever Monaco editor is currently active.
 * It is rendered as a sibling to the editor components in InputArea.
 */
import { useEffect, useRef } from 'react';
import type * as monacoEditor from 'monaco-editor';
import { useCollaboration } from './useCollaboration';
import { MonacoCollabBinding } from './MonacoCollabBinding';

interface CollabEditorBridgeProps {
    // Function to get the current active Monaco editor instance
    getEditor: () => monacoEditor.editor.IStandaloneCodeEditor | null;
    // Function to get the monaco module 
    getMonaco: () => typeof monacoEditor;
    // Key to trigger re-bind when the editor instance changes
    editorInstanceKey: number;
}

const CollabEditorBridge: React.FC<CollabEditorBridgeProps> = ({ getEditor, getMonaco, editorInstanceKey }) => {
    const bindingRef = useRef<MonacoCollabBinding | null>(null);
    const { sessionId, connected, bindEditor, unbindEditor } = useCollaboration();

    // When session becomes active AND connected, create the binding
    useEffect(() => {
        // Clean up previous binding
        if (bindingRef.current) {
            bindingRef.current.destroy();
            bindingRef.current = null;
        }

        if (!sessionId || !connected) {
            return;
        }

        const editor = getEditor();
        if (!editor) return;

        const model = editor.getModel();
        if (!model) return;

        const monacoModule = getMonaco();

        // Bind the editor to the Yjs session
        bindEditor(editor, model, monacoModule);

        return () => {
            unbindEditor();
        };
    }, [sessionId, connected, editorInstanceKey]);

    return null; // This component renders nothing
};

export default CollabEditorBridge;
