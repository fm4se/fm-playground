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
        if (explainResults.error) {
            return (
                <div
                    style={{
                        margin: '8px 10px',
                        padding: '8px 12px',
                        backgroundColor: isDark ? '#3b1c1c' : '#ffe6e6',
                        borderLeft: '4px solid #ff4d4d',
                        borderRadius: '4px',
                        fontSize: '0.85em',
                        fontFamily: 'monospace',
                        color: isDark ? '#ff9999' : '#cc0000',
                    }}
                >
                    // Error explaining redundancy: {explainResults.error}
                </div>
            );
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

        if (!hasEntailing) {
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
                    }}
                >
                    <div style={{ fontWeight: 'bold', color: isDark ? '#ffd43b' : '#f08c00', marginBottom: '4px' }}>
                        // Explained Redundancy: Line {explainResults.selectedConstraint.position.startLine} is redundant (highlighted in green).
                    </div>
                    <div style={{ color: isDark ? '#d4d4d4' : '#495057', marginLeft: '10px' }}>
                        // {explainResults.message || 'No explanation based on other facts found. Redundancy originates from structural elements.'}
                    </div>
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
                    <span>
                        // Explained Redundancy: Line {explainResults.selectedConstraint.position.startLine} is made redundant by {explainResults.entailingCount ?? explainResults.entailingSet?.length ?? 0} entailing constraint(s) (highlighted in green).
                    </span>
                    <span style={{ fontSize: '0.85em', opacity: 0.75 }}>{isCollapsed ? '▶ Expand' : '▼ Collapse'}</span>
                </div>
                {!isCollapsed &&
                    explainResults.entailingSet?.map((c, i) => (
                        <div key={i} style={{ color: isDark ? '#d4d4d4' : '#495057', marginLeft: '10px', marginTop: '2px' }}>
                            // Entailing (Line {c.position?.startLine}{c.position?.endLine > c.position?.startLine ? `-${c.position.endLine}` : ''}): {c.sourceText || c.expression}
                        </div>
                    ))}
            </div>
        );
    }

    // --- Render Check Redundancy Summary ---
    if (checkResults && checkResults.error) {
        return (
            <div
                style={{
                    margin: '8px 10px',
                    padding: '8px 12px',
                    backgroundColor: isDark ? '#3b1c1c' : '#ffe6e6',
                    borderLeft: '4px solid #ff4d4d',
                    borderRadius: '4px',
                    fontSize: '0.85em',
                    fontFamily: 'monospace',
                    color: isDark ? '#ff9999' : '#cc0000',
                }}
            >
                // Error checking redundancy: {checkResults.error}
            </div>
        );
    }

    if (!checkResults || !checkResults.redundantConstraints || checkResults.redundantConstraints.length === 0) {
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
                // No redundant constraints found (out of {checkResults?.totalConstraints ?? 0} total constraints checked).
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