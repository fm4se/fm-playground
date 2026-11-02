/**
 * One "<< atom >>" chooser per projected sig, as at the bottom of Alloy's
 * visualizer (VizGraphPanel.TypePanel).
 */
import React from 'react';
import { AlloyAtom } from '../core/model';

export interface ProjectionChoice {
    typeName: string;
    atoms: readonly AlloyAtom[];
    /** Display names of the atoms, in the same order. */
    names: readonly string[];
    selected: number;
}

interface ProjectionBarProps {
    choices: ProjectionChoice[];
    onSelect: (typeName: string, atom: AlloyAtom) => void;
}

const ProjectionBar: React.FC<ProjectionBarProps> = ({ choices, onSelect }) => {
    if (choices.length === 0) return null;
    return (
        <div className='alloy-viz-projection' onMouseDown={(e) => e.stopPropagation()}>
            {choices.map((c) => (
                <div key={c.typeName} className='alloy-viz-projection-item' title={`Projected over ${c.typeName}`}>
                    <span className='alloy-viz-projection-type'>{c.typeName}</span>
                    <button disabled={c.selected <= 0} onClick={() => onSelect(c.typeName, c.atoms[c.selected - 1])}>
                        {'<<'}
                    </button>
                    <select
                        value={c.selected}
                        disabled={c.atoms.length === 0}
                        onChange={(e) => onSelect(c.typeName, c.atoms[Number(e.target.value)])}
                    >
                        {c.atoms.length === 0 && <option value={0}> </option>}
                        {c.names.map((n, i) => (
                            <option key={i} value={i}>
                                {n}
                            </option>
                        ))}
                    </select>
                    <button
                        disabled={c.selected >= c.atoms.length - 1}
                        onClick={() => onSelect(c.typeName, c.atoms[c.selected + 1])}
                    >
                        {'>>'}
                    </button>
                </div>
            ))}
        </div>
    );
};

export default ProjectionBar;
