/**
 * The trace overview of Alloy's visualizer (VizGUI.traceGraph): one circle per
 * position, labelled with its state, an arrow from the last position back to
 * the loop state, and the displayed positions filled white. Click to jump.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { normalizeState } from '../core/reader';

interface TraceTimelineProps {
    position: number;
    panes: number;
    traceLength: number;
    loopState: number;
    onSelect: (position: number) => void;
}

const RADIUS = 12;
const DIST = 45;
const HEIGHT = 50;

const TraceTimeline: React.FC<TraceTimelineProps> = ({ position, panes, traceLength, loopState, onSelect }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setWidth(el.clientWidth));
        ro.observe(el);
        setWidth(el.clientWidth);
        return () => ro.disconnect();
    }, []);

    const loopLength = traceLength - loopState;
    const count = Math.max(position + panes, traceLength);
    const loopTarget = count - loopLength;
    const offsetX = width / 2 + (DIST - 2 * RADIUS) / 2 - DIST * (position + 1);
    const cy = 2 + HEIGHT / 2;
    const min = normalizeState(position, count, loopTarget);
    const max = normalizeState(position + panes - 1, count, loopTarget);
    const shown = (i: number) => (min <= max ? i >= min && i <= max : i >= min || (i <= max && i >= loopTarget));
    const cx = (i: number) => i * DIST + offsetX + RADIUS;
    const last = cx(count - 1);
    const loop = cx(loopTarget);

    return (
        <div ref={ref} className='alloy-viz-timeline' onMouseDown={(e) => e.stopPropagation()}>
            <svg width='100%' height={HEIGHT} fontSize={12}>
                <defs>
                    <marker
                        id='alloy-trace-arrow'
                        viewBox='0 0 8 8'
                        refX='8'
                        refY='4'
                        markerWidth='8'
                        markerHeight='8'
                        orient='auto'
                    >
                        <path d='M0,0 L8,4 L0,8 z' fill='currentColor' />
                    </marker>
                </defs>
                {Array.from({ length: count - 1 }, (_, i) => (
                    <line
                        key={`l${i}`}
                        x1={cx(i) + RADIUS}
                        y1={cy}
                        x2={cx(i + 1) - RADIUS}
                        y2={cy}
                        stroke='currentColor'
                        markerEnd='url(#alloy-trace-arrow)'
                    />
                ))}
                <path
                    d={`M ${last} ${cy - RADIUS} C ${last - 25} 0 ${loop + 25} 0 ${loop} ${cy - RADIUS}`}
                    fill='none'
                    stroke='currentColor'
                    markerEnd='url(#alloy-trace-arrow)'
                />
                {Array.from({ length: count }, (_, i) => (
                    <g key={`c${i}`} onClick={() => onSelect(i)} style={{ cursor: 'pointer' }}>
                        <title>{`State ${normalizeState(i, traceLength, loopState)}`}</title>
                        <circle
                            cx={cx(i)}
                            cy={cy}
                            r={RADIUS}
                            fill={shown(i) ? '#ffffff' : '#787878'}
                            stroke='currentColor'
                            strokeWidth={2}
                        />
                        <text x={cx(i)} y={cy + 4} textAnchor='middle' fill='#000000'>
                            {normalizeState(i, traceLength, loopState)}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
};

export default TraceTimeline;
