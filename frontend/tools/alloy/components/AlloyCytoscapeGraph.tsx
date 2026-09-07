import React, { useEffect, useState, useCallback, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import {
    GraphElement,
    LegendItem,
    ContextMenuState,
    getUniqueRelationships,
    buildLegendItems,
    createCytoscapeStylesheet,
    useGraphInteractions,
    useCustomColors,
    GraphLegend,
    GraphContextMenu,
    ContextMenuItem,
    ColorPicker,
    DEFAULT_NODE_COLOR,
    extractNodeType,
    registerCytoscapeExtensions,
    LayoutName,
    LAYOUT_OPTIONS,
    getLayoutConfig,
    saveLayoutPreference,
    loadLayoutPreference,
} from './graph';

// Register cytoscape extensions on module load
registerCytoscapeExtensions();

interface AlloyCytoscapeGraphProps {
    alloyVizGraph: GraphElement[];
    height: string;
}

interface ColorPickerState {
    visible: boolean;
    x: number;
    y: number;
    currentColor: string;
    targetType: 'node' | 'nodeType' | 'relationship';
    targetId: string;
}

const initialContextMenuState: ContextMenuState = {
    visible: false,
    x: 0,
    y: 0,
    targetType: 'canvas',
    targetId: null,
    targetLabel: null,
    targetRelationship: null,
    targetNodeType: null,
};

const initialColorPickerState: ColorPickerState = {
    visible: false,
    x: 0,
    y: 0,
    currentColor: DEFAULT_NODE_COLOR,
    targetType: 'node',
    targetId: '',
};

const AlloyCytoscapeGraph: React.FC<AlloyCytoscapeGraphProps> = ({ alloyVizGraph, height }) => {
    const cyRef = React.useRef<cytoscape.Core | null>(null);
    const isInitialMount = useRef(true);
    const prevGraphRef = useRef<string>('');
    const [stylesheet, setStylesheet] = useState<any[]>([]);
    const [legendItems, setLegendItems] = useState<LegendItem[]>([]);
    const [currentLayout, setCurrentLayout] = useState<LayoutName>(() => loadLayoutPreference());
    const [activeRelationship, setActiveRelationship] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>(initialContextMenuState);
    const [colorPicker, setColorPicker] = useState<ColorPickerState>(initialColorPickerState);
    const needsLayoutRef = useRef<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const {
        customColors,
        setNodeColor,
        setNodeTypeColor,
        setRelationshipColor,
        resetNodeColor,
        resetNodeTypeColor,
        resetRelationshipColor,
        resetAllColors,
        getNodeColor,
        getRelationshipColor,
    } = useCustomColors();

    const { setupInteractions, highlightRelationship, clearHighlights } = useGraphInteractions({
        onRelationshipHover: setActiveRelationship,
    });

    // Close context menu
    const closeContextMenu = useCallback(() => {
        setContextMenu(initialContextMenuState);
    }, []);

    // Close color picker
    const closeColorPicker = useCallback(() => {
        setColorPicker(initialColorPickerState);
    }, []);

    // Handle legend item hover
    const handleLegendHover = useCallback(
        (relationship: string) => {
            if (cyRef.current) {
                highlightRelationship(cyRef.current, relationship);
            }
        },
        [highlightRelationship]
    );

    const handleLegendLeave = useCallback(() => {
        if (cyRef.current) {
            clearHighlights(cyRef.current);
        }
    }, [clearHighlights]);

    // Change layout
    const changeLayout = useCallback((layoutName: LayoutName) => {
        if (cyRef.current) {
            const layoutConfig = getLayoutConfig(layoutName);
            const layout = cyRef.current.layout(layoutConfig);
            layout.run();
            setCurrentLayout(layoutName);
            saveLayoutPreference(layoutName);
        }
    }, []);

    // Open color picker
    const openColorPicker = useCallback(
        (
            x: number,
            y: number,
            targetType: 'node' | 'nodeType' | 'relationship',
            targetId: string,
            currentColor: string
        ) => {
            setColorPicker({
                visible: true,
                x: Math.min(x, window.innerWidth - 250),
                y: Math.min(y, window.innerHeight - 300),
                currentColor,
                targetType,
                targetId,
            });
        },
        []
    );

    // Handle color change from picker
    const handleColorChange = useCallback(
        (color: string) => {
            switch (colorPicker.targetType) {
                case 'node':
                    setNodeColor(colorPicker.targetId, color);
                    break;
                case 'nodeType':
                    setNodeTypeColor(colorPicker.targetId, color);
                    break;
                case 'relationship':
                    setRelationshipColor(colorPicker.targetId, color);
                    break;
            }
        },
        [colorPicker, setNodeColor, setNodeTypeColor, setRelationshipColor]
    );

    // Build context menu items based on target
    const getContextMenuItems = useCallback((): ContextMenuItem[] => {
        const items: ContextMenuItem[] = [];

        if (contextMenu.targetType === 'node' && contextMenu.targetId) {
            const nodeId = contextMenu.targetId;
            const nodeLabel = contextMenu.targetLabel || nodeId;
            const nodeType = contextMenu.targetNodeType;
            const currentNodeColor = getNodeColor(nodeId, nodeType || undefined) || DEFAULT_NODE_COLOR;

            items.push({
                label: `Change color of "${nodeLabel}"`,
                icon: '',
                onClick: () => {
                    openColorPicker(contextMenu.x, contextMenu.y, 'node', nodeId, currentNodeColor);
                },
            });

            if (nodeType) {
                items.push({
                    label: `Change color of all "${nodeType}" nodes`,
                    icon: '',
                    onClick: () => {
                        openColorPicker(contextMenu.x, contextMenu.y, 'nodeType', nodeType, currentNodeColor);
                    },
                });
            }

            items.push({ label: '', onClick: () => {}, divider: true });

            if (customColors.nodes?.has(nodeId)) {
                items.push({
                    label: `Reset "${nodeLabel}" color`,
                    icon: '',
                    onClick: () => resetNodeColor(nodeId),
                });
            }

            if (nodeType && customColors.nodeTypes?.has(nodeType)) {
                items.push({
                    label: `Reset all "${nodeType}" colors`,
                    icon: '',
                    onClick: () => resetNodeTypeColor(nodeType),
                });
            }
        }

        if (contextMenu.targetType === 'edge' && contextMenu.targetRelationship) {
            const relationship = contextMenu.targetRelationship;
            const label = contextMenu.targetLabel || relationship;
            const currentColor = getRelationshipColor(relationship) || '#888888';

            items.push({
                label: `Change color of "${label}" relations`,
                icon: '',
                onClick: () => {
                    openColorPicker(contextMenu.x, contextMenu.y, 'relationship', relationship, currentColor);
                },
            });

            if (customColors.relationships?.has(relationship)) {
                items.push({ label: '', onClick: () => {}, divider: true });
                items.push({
                    label: `Reset "${label}" color`,
                    icon: '',
                    onClick: () => resetRelationshipColor(relationship),
                });
            }
        }

        if (contextMenu.targetType === 'canvas') {
            // Layout options
            items.push({
                label: 'Layout',
                icon: '',
                onClick: () => {},
                disabled: true,
            });

            LAYOUT_OPTIONS.forEach((layoutOpt) => {
                const isCurrentLayout = currentLayout === layoutOpt.name;
                items.push({
                    label: `${isCurrentLayout ? '✓ ' : '   '}${layoutOpt.label}`,
                    icon: layoutOpt.icon,
                    onClick: () => changeLayout(layoutOpt.name),
                    disabled: isCurrentLayout,
                });
            });

            items.push({ label: '', onClick: () => {}, divider: true });

            const hasCustomColors =
                (customColors.nodes?.size || 0) > 0 ||
                (customColors.nodeTypes?.size || 0) > 0 ||
                (customColors.relationships?.size || 0) > 0;

            if (hasCustomColors) {
                items.push({
                    label: 'Reset all custom colors',
                    icon: '',
                    onClick: resetAllColors,
                });
            }
        }

        return items;
    }, [
        contextMenu,
        customColors,
        currentLayout,
        getNodeColor,
        getRelationshipColor,
        openColorPicker,
        resetNodeColor,
        resetNodeTypeColor,
        resetRelationshipColor,
        resetAllColors,
        changeLayout,
    ]);

    // Setup right-click context menu handler
    const setupContextMenu = useCallback((cy: cytoscape.Core) => {
        cy.on('cxttap', 'node', (e) => {
            const node = e.target;
            const position = e.renderedPosition || e.position;
            const container = cy.container();
            const rect = container?.getBoundingClientRect();
            const nodeId = node.id();
            const nodeType = node.data('nodeType') || extractNodeType(nodeId);

            setContextMenu({
                visible: true,
                x: (rect?.left || 0) + position.x,
                y: (rect?.top || 0) + position.y,
                targetType: 'node',
                targetId: nodeId,
                targetLabel: node.data('label'),
                targetRelationship: null,
                targetNodeType: nodeType,
            });
        });

        cy.on('cxttap', 'edge', (e) => {
            const edge = e.target;
            const position = e.renderedPosition || e.position;
            const container = cy.container();
            const rect = container?.getBoundingClientRect();

            setContextMenu({
                visible: true,
                x: (rect?.left || 0) + position.x,
                y: (rect?.top || 0) + position.y,
                targetType: 'edge',
                targetId: edge.id(),
                targetLabel: edge.data('label'),
                targetRelationship: edge.data('relationship'),
                targetNodeType: null,
            });
        });

        cy.on('cxttap', (e) => {
            if (e.target === cy) {
                const position = e.renderedPosition || e.position;
                const container = cy.container();
                const rect = container?.getBoundingClientRect();

                setContextMenu({
                    visible: true,
                    x: (rect?.left || 0) + position.x,
                    y: (rect?.top || 0) + position.y,
                    targetType: 'canvas',
                    targetId: null,
                    targetLabel: null,
                    targetRelationship: null,
                    targetNodeType: null,
                });
            }
        });
    }, []);

    // Update stylesheet and legend when graph data or custom colors change
    useEffect(() => {
        const uniqueRels = getUniqueRelationships(alloyVizGraph);
        const items = buildLegendItems(alloyVizGraph);

        // Update legend items with custom colors
        const updatedItems = items.map((item) => ({
            ...item,
            color: customColors.relationships?.get(item.relationship) || item.color,
        }));

        setLegendItems(updatedItems);
        setStylesheet(createCytoscapeStylesheet(uniqueRels, customColors));
    }, [alloyVizGraph, customColors]);

    // Function to run the layout
    const runLayout = useCallback(() => {
        if (!cyRef.current) return;
        
        // Give Cytoscape a tick to render nodes and compute their bounding boxes.
        // Layouts like Dagre will squash nodes to (0,0) if they don't have dimensions yet.
        setTimeout(() => {
            if (!cyRef.current) return;
            try {
                const layoutConfig = getLayoutConfig(currentLayout);
                const layout = cyRef.current.layout(layoutConfig);
                layout.run();
            } catch (error) {
                console.warn('Layout failed, falling back to breadthfirst:', error);
                const fallbackLayout = cyRef.current.layout({
                    name: 'breadthfirst',
                    animate: true,
                    animationDuration: 500,
                    fit: true,
                    padding: 50,
                    directed: true,
                    spacingFactor: 1.5,
                });
                fallbackLayout.run();
            }
            cyRef.current.fit(undefined, 50);
        }, 100);
    }, [currentLayout]);

    // Run layout only when graph data changes (not when colors change)
    useEffect(() => {
        // Create a simple hash of the graph structure to detect actual data changes
        const graphHash = JSON.stringify(alloyVizGraph.map((e) => e.data.id).sort());
        const graphChanged = graphHash !== prevGraphRef.current;
        prevGraphRef.current = graphHash;

        if (cyRef.current) {
            // Only run layout on initial mount or when graph structure changes
            if (isInitialMount.current || graphChanged) {
                const width = cyRef.current.width();
                const height = cyRef.current.height();
                
                if (width === 0 || height === 0) {
                    // Container is hidden, defer layout
                    needsLayoutRef.current = true;
                } else {
                    runLayout();
                    needsLayoutRef.current = false;
                }

                isInitialMount.current = false;
            }

            // Always setup interactions (they get cleared on re-render)
            setupInteractions(cyRef.current);

            // Setup context menu
            setupContextMenu(cyRef.current);
        }
    }, [alloyVizGraph, stylesheet, currentLayout, setupInteractions, setupContextMenu, runLayout]);

    // Watch for container resize to trigger deferred layout
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    if (cyRef.current) {
                        cyRef.current.resize();
                    }
                    if (needsLayoutRef.current) {
                        runLayout();
                        needsLayoutRef.current = false;
                    }
                }
            }
        });

        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, [runLayout]);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', height: height }}>
            <CytoscapeComponent
                className='alloy-viz-area'
                elements={alloyVizGraph}
                style={{
                    width: '100%',
                    height: '100%',
                }}
                stylesheet={stylesheet}
                minZoom={0.1}
                maxZoom={2}
                wheelSensitivity={0.3}
                cy={(cy) => {
                    cyRef.current = cy;
                }}
            />
            <GraphLegend
                items={legendItems}
                onItemHover={handleLegendHover}
                onItemLeave={handleLegendLeave}
                activeRelationship={activeRelationship}
            />
            <GraphContextMenu state={contextMenu} onClose={closeContextMenu} items={getContextMenuItems()} />
            {colorPicker.visible && (
                <ColorPicker
                    currentColor={colorPicker.currentColor}
                    onColorChange={handleColorChange}
                    onClose={closeColorPicker}
                    position={{ x: colorPicker.x, y: colorPicker.y }}
                />
            )}
        </div>
    );
};

export default AlloyCytoscapeGraph;
