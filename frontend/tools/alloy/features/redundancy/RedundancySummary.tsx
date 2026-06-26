import React, { useState, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { alloyRedundancyResultsAtom, alloyExplainResultsAtom } from './redundancyAtoms';
import { isDarkThemeAtom } from '@/atoms';

export const RedundancySummary: React.FC = () => {
    const checkResults = useAtomValue(alloyRedundancyResultsAtom);
    const explainResults = useAtomValue(alloyExplainResultsAtom);
    const isDark = useAtomValue(isDarkThemeAtom);
    const [isCollapsed, setIsCollapsed] = useState(true);

    // Reset to collapsed whenever new results are received
    useEffect(() => {
        if (checkResults || explainResults) {
            setIsCollapsed(true);
        }
    }, [checkResults, explainResults]);

    if (!checkResults && !explainResults) return null;

    // --- Render Explain Redundancy Summary ---
    if (explainResults) {
        if (explainResults.error || (explainResults.status && explainResults.status !== 200)) {
            return null;
        }

        if (!explainResults.redundant || !explainResults.selectedConstraint) {
            return (
                <div
                    style={{
                        margin: '8px 10px',
                        padding: '8px 12px',
                        backgroundColor: isDark ? '#1c3b2b' : '#e6ffe6',
                        borderLeft: '4px solid #2ecc71',
                        borderRadius: '4px',
                        fontSize: '0.85em',
                        fontFamily: 'monospace',
                        color: isDark ? '#a3e4d7' : '#196f3d',
                    }}
                >
                    // Explain Redundancy: {explainResults.message || 'Selected constraint is not redundant or not found.'}
                </div>
            );
        }

        const hasEntailing = explainResults.entailingSet && explainResults.entailingSet.length > 0;
        const titleText = hasEntailing
            ? `// Explained Redundancy: Line ${explainResults.selectedConstraint.position.startLine} is made redundant by ${explainResults.entailingCount ?? explainResults.entailingSet?.length ?? 0} entailing constraint(s) (highlighted in green).`
            : `// Explained Redundancy: Line ${explainResults.selectedConstraint.position.startLine} is redundant (highlighted in green).`;

        return (
            <div
                style={{
                    margin: '8px 10px',
                    padding: '8px 12px',
                    backgroundColor: isDark ? '#2b2a1d' : '#fff9db',
                    borderLeft: '4px solid #fcc419',
                    borderRadius: '4px',
                    fontSize: '0.85em',
                    fontFamily: 'monospace',
                    maxHeight: isCollapsed ? '36px' : '110px',
                    overflowY: isCollapsed ? 'hidden' : 'auto',
                    transition: 'max-height 0.2s ease-in-out',
                }}
            >
                <div
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    style={{
                        fontWeight: 'bold',
                        color: isDark ? '#ffd43b' : '#f08c00',
                        marginBottom: isCollapsed ? '0px' : '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        userSelect: 'none',
                    }}
                >
                    <span>{titleText}</span>
                    <span style={{ fontSize: '0.85em', opacity: 0.75 }}>{isCollapsed ? '▶ Expand' : '▼ Collapse'}</span>
                </div>
                {!isCollapsed &&
                    (hasEntailing ? (
                        explainResults.entailingSet?.map((c, i) => (
                            <div key={i} style={{ color: isDark ? '#d4d4d4' : '#495057', marginLeft: '10px', marginTop: '2px' }}>
                                // Entailing (Line {c.position?.startLine}{c.position?.endLine > c.position?.startLine ? `-${c.position.endLine}` : ''}): {c.sourceText || c.expression}
                            </div>
                        ))
                    ) : (
                        <div style={{ color: isDark ? '#d4d4d4' : '#495057', marginLeft: '10px', marginTop: '2px' }}>
                            // {explainResults.message || 'No explanation based on other facts found. Redundancy originates from structural elements.'}
                        </div>
                    ))}
            </div>
        );
    }

    // --- Render Check Redundancy Summary ---
    if (!checkResults) return null;

    if (checkResults.error || (checkResults.status && checkResults.status !== 200)) {
        return null;
    }

    if (!checkResults.redundantConstraints || checkResults.redundantConstraints.length === 0) {
        if (checkResults.isDefault) return null;
        return (
            <div
                style={{
                    margin: '8px 10px',
                    padding: '8px 12px',
                    backgroundColor: isDark ? '#1c3b2b' : '#e6ffe6',
                    borderLeft: '4px solid #2ecc71',
                    borderRadius: '4px',
                    fontSize: '0.85em',
                    fontFamily: 'monospace',
                    color: isDark ? '#a3e4d7' : '#196f3d',
                }}
            >
                // No redundant constraints found (out of {checkResults.totalConstraints ?? 0} total constraints checked).
            </div>
        );
    }

    return (
        <div
            style={{
                margin: '8px 10px',
                padding: '8px 12px',
                backgroundColor: isDark ? '#2b2a1d' : '#fff9db',
                borderLeft: '4px solid #fcc419',
                borderRadius: '4px',
                fontSize: '0.85em',
                fontFamily: 'monospace',
                maxHeight: isCollapsed ? '36px' : '110px',
                overflowY: isCollapsed ? 'hidden' : 'auto',
                transition: 'max-height 0.2s ease-in-out',
            }}
        >
            <div
                onClick={() => setIsCollapsed(!isCollapsed)}
                style={{
                    fontWeight: 'bold',
                    color: isDark ? '#ffd43b' : '#f08c00',
                    marginBottom: isCollapsed ? '0px' : '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    userSelect: 'none',
                }}
            >
                <span>// Found {checkResults.redundantCount} redundant constraint(s) (out of {checkResults.totalConstraints} total constraints).</span>
                <span style={{ fontSize: '0.85em', opacity: 0.75 }}>{isCollapsed ? '▶ Expand' : '▼ Collapse'}</span>
            </div>
            {!isCollapsed &&
                checkResults.redundantConstraints.map((c) => (
                    <div key={c.constraintIndex} style={{ color: isDark ? '#d4d4d4' : '#495057', marginLeft: '10px', marginTop: '2px' }}>
                        // Line {c.position?.startLine}: {c.sourceText || c.expression}
                    </div>
                ))}
        </div>
    );
};