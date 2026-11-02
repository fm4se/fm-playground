/**
 * Alloy's "Tree" view of an instance: sigs, their atoms, the atoms' fields and
 * the values in them. Expanding is lazy, the tree is unbounded.
 */
import React, { useMemo, useState } from 'react';
import { instanceTree, TreeItem } from '../core/instanceTree';
import { readXmlStates } from '../core/reader';

interface InstanceTreeProps {
    /** The Alloy API instance response. */
    response: unknown;
    /** Index of the state to show (already normalized). */
    state: number;
    height: string;
}

const InstanceTree: React.FC<InstanceTreeProps> = ({ response, state, height }) => {
    const roots = useMemo(() => {
        try {
            const states = readXmlStates(response as Record<string, unknown>);
            return states[state] ? instanceTree(states[state]) : [];
        } catch {
            return [];
        }
    }, [response, state]);
    return (
        <div className='alloy-viz-tree plain-alloy-message-box' style={{ height }}>
            {roots.length === 0 ? 'No instance' : roots.map((r) => <TreeNode key={r.id} item={r} depth={0} />)}
        </div>
    );
};

const TreeNode: React.FC<{ item: TreeItem; depth: number }> = ({ item, depth }) => {
    const [open, setOpen] = useState(false);
    const children = useMemo(() => (open ? item.children() : []), [open, item]);
    const bold = item.kind === 'sig' || item.kind === 'set' || item.kind === 'field';
    return (
        <div>
            <div className='alloy-viz-tree-row' style={{ paddingLeft: depth * 16 }} onClick={() => setOpen((o) => !o)}>
                <span className='alloy-viz-tree-toggle'>{open ? '▾' : '▸'}</span>
                <span style={{ fontWeight: bold ? 600 : undefined }}>{item.label}</span>
            </div>
            {open && children.map((c) => <TreeNode key={c.id} item={c} depth={depth + 1} />)}
            {open && children.length === 0 && (
                <div className='alloy-viz-tree-row alloy-theme-muted' style={{ paddingLeft: (depth + 1) * 16 + 14 }}>
                    (empty)
                </div>
            )}
        </div>
    );
};

export default InstanceTree;
