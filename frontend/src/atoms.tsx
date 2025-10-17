import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { WritableAtom } from 'jotai';
import { fmpConfig } from './ToolMaps';
import { createStore } from 'jotai';

// Custom storage for raw strings
const rawStringStorage = {
    getItem(key: string) {
        const val = localStorage.getItem(key);
        return val ?? '';
    },
    setItem(key: string, value: string) {
        localStorage.setItem(key, value);
    },
    removeItem(key: string) {
        localStorage.removeItem(key);
    },
};

export const jotaiStore = createStore();

// Default language
const defaultLanguage = Object.entries(fmpConfig.tools).map(([key, tool]) => ({
    id: key,
    value: tool.extension,
    label: tool.name,
    short: tool.shortName,
}))[0];

// Atoms
export const isDarkThemeAtom = atomWithStorage('isDarkTheme', false);
export const languageAtom = atomWithStorage('language', defaultLanguage);
export const permalinkAtom = atom<{ check: string | null; permalink: string | null }>({
    check: null,
    permalink: null,
});
export const isExecutingAtom = atom(false);
export const lineToHighlightAtom = atom<number[]>([]);
export const outputAtom = atom<string>('');
export const isFullScreenAtom = atom(false);
export const enableLspAtom = atom(true);
export const outputPreviewHeightAtom = atom<string | number>((get) => (get(isFullScreenAtom) ? '80vh' : '60vh'));
export const isLoadingPermalinkAtom = atom(false);

export const spectraCliOptionsAtom = atom('check-realizability');
export const limbooleCliOptionsAtom = atom({ value: '1', label: 'satisfiability' });

export const alloySelectedCmdAtom = atom(0);
export const alloyInstanceAtom = atom<any[]>([]);
export const alloyCmdOptionsAtom = atom<{ value: number; label: string }[]>([]);

// Dynamic editorValue atom based on language
const editorValueAtomCache = new Map<string, WritableAtom<string, [string | ((prev: string) => string)], void>>();

function getEditorValueAtomForLanguage(languageId: string) {
    const key = `${languageId}EditorValue`;

    if (!editorValueAtomCache.has(key)) {
        const newAtom = atomWithStorage<string>(key, '', rawStringStorage);
        editorValueAtomCache.set(key, newAtom);
    }

    return editorValueAtomCache.get(key)!;
}

export const currentEditorValueAtom: WritableAtom<string, [string | ((prev: string) => string)], void> = atom(
    (get) => {
        const language = get(languageAtom);
        const editorAtom = getEditorValueAtomForLanguage(language.id);
        return get(editorAtom);
    },
    (get, set, newValue) => {
        const language = get(languageAtom);
        const editorAtom = getEditorValueAtomForLanguage(language.id);
        set(editorAtom, newValue);
    }
);

// Subscriptions
jotaiStore.sub(currentEditorValueAtom, () => {});
jotaiStore.sub(languageAtom, () => {});
jotaiStore.sub(lineToHighlightAtom, () => {});
jotaiStore.sub(enableLspAtom, () => {});
jotaiStore.sub(isLoadingPermalinkAtom, () => {});
jotaiStore.sub(spectraCliOptionsAtom, () => {});
jotaiStore.sub(limbooleCliOptionsAtom, () => {});
jotaiStore.sub(alloySelectedCmdAtom, () => {});
jotaiStore.sub(alloyInstanceAtom, () => {});
jotaiStore.sub(alloyCmdOptionsAtom, () => {});
