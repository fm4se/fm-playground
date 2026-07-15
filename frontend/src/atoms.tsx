import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { createStore } from 'jotai';
import { fmpConfig } from './ToolMaps';

export const jotaiStore = createStore();

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
const defaultLanguage = Object.entries(fmpConfig.tools).map(([key, tool]) => ({
    id: key,
    value: tool.extension,
    label: tool.name,
    short: tool.shortName,
}))[0];

export const isDarkThemeAtom = atomWithStorage('isDarkTheme', false);
export const editorValueAtom = atom('');
export const languageAtom = atomWithStorage('language', defaultLanguage);
export const permalinkAtom = atom<{ check: string | null; permalink: string | null }>({ check: null, permalink: null });
export const isExecutingAtom = atom(false);
export const lineToHighlightAtom = atom<number[]>([]);
export const greenHighlightAtom = atom<number[]>([]); // For greenish highlighting (explain redundancy)
export const cursorLineAtom = atom<number>(1); // Current cursor line number (1-based)
export const cursorColumnAtom = atom<number>(1); // Current cursor column number (1-based)
export const selectedTextAtom = atom<string>(''); // Currently selected text in editor
export const selectionRangeAtom = atom<{
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
} | null>(null); // Current selection range in editor
export const targetAssertionRangeAtom = atom<{
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
} | null>(null);
export const minimalSetRangesAtom = atom<
    Array<{ startLine: number; startColumn: number; endLine: number; endColumn: number }>
>([]);
export const outputAtom = atom<string>('');
export const isFullScreenAtom = atom(false);
export const enableLspAtom = atom(true);
export const outputPreviewHeightAtom = atom<string | number>((get) => (get(isFullScreenAtom) ? '80vh' : '60vh'));
export const isLoadingPermalinkAtom = atom(false);
export const isDiffViewModeAtom = atom(false);
export const originalCodeAtom = atomWithStorage('originalCode', '', rawStringStorage);
export const diffComparisonCodeAtom = atom('');
export const diffComparisonHistoryIdAtom = atom<number | null>(null);
export const historyRefreshTriggerAtom = atom(0); // Incremented to trigger history refresh

export const spectraCliOptionsAtom = atom('check-realizability');
export const limbooleCliOptionsAtom = atom({ value: '1', label: 'satisfiability' });
export const smtCliOptionsAtom = atom({ value: 'execute-z3', label: 'Execute SMT' });
export const dafnyCliOptionsAtom = atom({ value: 'verify', label: 'Verify' });

export const alloyCliOptionsAtom = atom({ value: 'execute-alloy', label: 'Execute Alloy' });
export const alloySelectedCmdAtom = atom(0);
export const alloyInstanceAtom = atom<any[]>([]);
export const alloyCmdOptionsAtom = atom<{ value: number; label: string }[]>([]);

export const smtDiffOptionsAtom = atom('common-witness');
export const smtDiffWitnessAtom = atom<any>(null);
export const smtDiffFilterAtom = atom('');

export const limbooleDiffOptionsAtom = atom('common-witness');
export const limbooleDiffWitnessAtom = atom<any>(null);
export const limbooleDiffFilterAtom = atom('');

export const alloyDiffOptionsAtom = atom('SemDiff');
export const alloyDiffWitnessAtom = atom<any>(null);

export const smtModelAtom = atom<any>(null);

jotaiStore.sub(editorValueAtom, () => {});
jotaiStore.sub(languageAtom, () => {});
jotaiStore.sub(lineToHighlightAtom, () => {});
jotaiStore.sub(greenHighlightAtom, () => {});
jotaiStore.sub(cursorLineAtom, () => {});
jotaiStore.sub(cursorColumnAtom, () => {});
jotaiStore.sub(selectedTextAtom, () => {});
jotaiStore.sub(selectionRangeAtom, () => {});
jotaiStore.sub(targetAssertionRangeAtom, () => {});
jotaiStore.sub(minimalSetRangesAtom, () => {});
jotaiStore.sub(enableLspAtom, () => {});
jotaiStore.sub(isLoadingPermalinkAtom, () => {});
jotaiStore.sub(isDiffViewModeAtom, () => {});
jotaiStore.sub(originalCodeAtom, () => {});
jotaiStore.sub(diffComparisonCodeAtom, () => {});
jotaiStore.sub(spectraCliOptionsAtom, () => {});
jotaiStore.sub(limbooleCliOptionsAtom, () => {});
jotaiStore.sub(alloySelectedCmdAtom, () => {});
jotaiStore.sub(alloyInstanceAtom, () => {});
jotaiStore.sub(alloyCmdOptionsAtom, () => {});
jotaiStore.sub(alloyCliOptionsAtom, () => {});
jotaiStore.sub(alloyDiffOptionsAtom, () => {});
jotaiStore.sub(alloyDiffWitnessAtom, () => {});
