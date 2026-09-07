/// <reference path="./cytoscape-cise.d.ts" />
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import cise from 'cytoscape-cise';

// Register the extensions
let extensionsRegistered = false;

export const registerCytoscapeExtensions = () => {
    if (extensionsRegistered) return;

    try {
        cytoscape.use(dagre);
    } catch (e) {
        console.warn('Failed to register cytoscape-dagre:', e);
    }

    try {
        cytoscape.use(cise);
    } catch (e) {
        console.warn('Failed to register cytoscape-cise:', e);
    }

    extensionsRegistered = true;
};

export type LayoutName = 'breadthfirst' | 'concentric' | 'dagre' | 'cise';

export interface LayoutOption {
    name: LayoutName;
    label: string;
    description: string;
    icon: string;
}

export const LAYOUT_OPTIONS: LayoutOption[] = [
    {
        name: 'dagre',
        label: 'Hierarchical',
        description: 'Top-down hierarchy for DAGs',
        icon: '',
    },
    {
        name: 'breadthfirst',
        label: 'Tree',
        description: 'Breadth-first tree layout',
        icon: '',
    },
    {
        name: 'concentric',
        label: 'Concentric',
        description: 'Circular/radial patterns',
        icon: '',
    },
    {
        name: 'cise',
        label: 'Clustered',
        description: 'Circular layout for clustered graphs',
        icon: '',
    },
];

export interface LayoutConfig {
    name: string;
    animate: boolean;
    animationDuration: number;
    fit: boolean;
    padding: number;
    [key: string]: any;
}

export const getLayoutConfig = (layoutName: LayoutName): LayoutConfig => {
    const baseConfig = {
        animate: false,
        animationDuration: 500,
        fit: true,
        padding: 50,
    };

    switch (layoutName) {
        case 'dagre':
            return {
                ...baseConfig,
                name: 'dagre',
                rankDir: 'TB', // Top to Bottom
                nodeSep: 50,
                rankSep: 100,
                edgeSep: 10,
            };

        case 'breadthfirst':
            return {
                ...baseConfig,
                name: 'breadthfirst',
                directed: true,
                spacingFactor: 1.5,
                avoidOverlap: true,
                circle: false,
            };

        case 'concentric':
            return {
                ...baseConfig,
                name: 'concentric',
                minNodeSpacing: 50,
                concentric: (node: any) => node.degree(),
                levelWidth: () => 2,
                avoidOverlap: true,
            };

        case 'cise':
            return {
                ...baseConfig,
                name: 'cise',
                clusters: () => [], // Auto-detect clusters based on connectivity
                allowNodesInsideCircle: false,
                maxRatioOfNodesInsideCircle: 0.1,
                springCoeff: 0.45,
                nodeRepulsion: 4500,
                gravity: 0.25,
                gravityRange: 3.8,
            };

        default:
            return {
                ...baseConfig,
                name: 'dagre',
                rankDir: 'TB',
                nodeSep: 50,
                rankSep: 100,
                edgeSep: 10,
            };
    }
};

// Storage key for persisting layout preference
const LAYOUT_STORAGE_KEY = 'alloy-graph-layout';

export const saveLayoutPreference = (layoutName: LayoutName): void => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layoutName);
};

export const loadLayoutPreference = (): LayoutName => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved && LAYOUT_OPTIONS.some((opt) => opt.name === saved)) {
        return saved as LayoutName;
    }
    // Clear invalid saved preference
    if (saved) {
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
    }
    return 'breadthfirst'; // Default to built-in layout for reliability
};
