// Tool output components
import TextualOutput from '@/components/Playground/TextualOutput';
import AlloyOutput from '@/../tools/alloy/components/AlloyOutput';
import SmtOutput from '@/../tools/smt/components/SmtOutput';
import LimbooleOutput from '@/../tools/limboole/components/LimbooleOutput';

// Language configurations for the different tools
import { limbooleConf, limbooleLang } from '@/../tools/limboole/limbooleTextMateGrammar';
import { smt2Conf, smt2Lang } from '@/../tools/smt/smt2TextMateGrammar';
import { nuxmvConf, nuxmvLang } from '@/../tools/nuxmv/nuxmvTextMateGrammar';
import { alloyConf, alloyLang } from '@/../tools/alloy/alloyTextMateGrammar';
import { spectraConf, spectraLang } from '@/../tools/spectra/spectraTextMateGrammar';
import { dafnyConf, dafnyLang } from '@/../tools/dafny/dafnyTextMateGrammar';

// Additional input area components for the different tools
import LimbooleCheckOptions from '@/../tools/limboole/components/limbooleCheckOptions';
import SmtCheckOptions from '@/../tools/smt/components/smtCheckOptions';
import SpectraCliOptions from '@/../tools/spectra/components/SpectraCliOptions';
import AlloyCmdOptions from '@/../tools/alloy/components/AlloyCmdOptions';
import DafnyCmdOptions from '@/../tools/dafny/components/DafnyCmdOptions';

// Additional output area components for the different tools
import NuxmvCopyrightNotice from '@/../tools/nuxmv/components/NuxmvCopyrightNotice';

// Diff tool input area components for the different tools
import SmtDiffOptions from '@/../tools/smt-diff/components/smtDiffOptions';
import LimbooleDiffOptions from '@/../tools/limboole-diff/components/limbooleDiffOptions';
import AlloyDiffOptions from '@/../tools/alloy-diff/components/alloyDiffOptions';

// Diff tool output area components for the different tools
import SmtDiffOutput from '@/../tools/smt-diff/components/smtDiffOutput';
import LimbooleDiffOutput from '@/../tools/limboole-diff/components/limbooleDiffOutput';
import AlloyDiffOutput from '@/../tools/alloy-diff/components/alloyDiffOutput';

// Diff tool executors. Imported statically: the diff output components above already
// import helpers from them, and they don't depend on the editor, so a lazy import()
// would not move them out of the initial bundle.
import { executeSmtDiffTool } from '@/../tools/smt-diff/smtDiffExecutor';
import { executeLimbooleDiffTool } from '@/../tools/limboole-diff/limbooleDiffExecutor';
import { executeAlloyDiffTool } from '@/../tools/alloy-diff/alloyDiffExecutor';

import type { FmpConfig } from '@/types';

export const additionalInputAreaUiMap: Record<string, React.FC<any>> = {
    SAT: LimbooleCheckOptions,
    SMT: SmtCheckOptions,
    SPECTRA: SpectraCliOptions,
    ALS: AlloyCmdOptions,
    DFY: DafnyCmdOptions,
};

export const additonalOutputAreaUiMap: Record<string, React.FC<any>> = {
    XMV: NuxmvCopyrightNotice,
};

/**
 * Executors are imported on the first Run instead of at startup: 
 * several of them depend on the VS Code/Monaco API, which would otherwise be pulled into the initial bundle. 
 * The returned promise rejects only if the executor's chunk fails to load; 
 * the executor itself is started without being awaited.
 */
const lazyExecutor =
    (load: () => Promise<() => unknown>) =>
    async (): Promise<void> => {
        const execute = await load();
        execute();
    };

/** Wraps an already-loaded executor so it fits the same signature as `lazyExecutor`. */
const eagerExecutor =
    (execute: () => unknown) =>
    async (): Promise<void> => {
        execute();
    };

export const toolExecutionMap: Record<string, () => Promise<void>> = {
    SAT: lazyExecutor(() => import('@/../tools/limboole/limbooleExecutor').then((m) => m.executeLimboole)),
    SMT: lazyExecutor(() => import('@/../tools/smt/z3Executor').then((m) => m.executeZ3WithOptionOnServer)),
    XMV: lazyExecutor(() => import('@/../tools/nuxmv/nuxmvExecutor').then((m) => m.executeNuxmvTool)),
    ALS: lazyExecutor(() => import('@/../tools/alloy/alloyExecutor').then((m) => m.executeAlloyTool)),
    SPECTRA: lazyExecutor(() => import('@/../tools/spectra/spectraExecutor').then((m) => m.executeSpectraTool)),
    SMTDiff: eagerExecutor(executeSmtDiffTool),
    SATDiff: eagerExecutor(executeLimbooleDiffTool),
    ALSDiff: eagerExecutor(executeAlloyDiffTool),
    DFY: lazyExecutor(() => import('@/../tools/dafny/dafnyExecutor').then((m) => m.executeDafnyTool)),
};

export const toolOutputMap: Record<string, React.FC<any>> = {
    SAT: LimbooleOutput,
    SMT: SmtOutput,
    XMV: TextualOutput,
    ALS: AlloyOutput,
    SPECTRA: TextualOutput,
    DFY: TextualOutput,
};

export const diffToolInputUIMap: Record<string, React.FC<any> | null> = {
    SAT: LimbooleDiffOptions,
    SMT: SmtDiffOptions,
    XMV: null,
    ALS: AlloyDiffOptions,
    SPECTRA: null,
    DFY: null,
};

export const diffToolOutputUIMap: Record<string, React.FC<any> | null> = {
    SAT: LimbooleDiffOutput,
    SMT: SmtDiffOutput,
    XMV: null,
    ALS: AlloyDiffOutput,
    SPECTRA: null,
    DFY: null,
};

export const languageConfigMap: Record<string, { tokenProvider: any; configuration: any }> = {
    limboole: { tokenProvider: limbooleLang, configuration: limbooleConf },
    smt2: { tokenProvider: smt2Lang, configuration: smt2Conf },
    xmv: { tokenProvider: nuxmvLang, configuration: nuxmvConf },
    als: { tokenProvider: alloyLang, configuration: alloyConf },
    spectra: { tokenProvider: spectraLang, configuration: spectraConf },
    dfy: { tokenProvider: dafnyLang, configuration: dafnyConf },
};

// Configuration for LSP (Language Server Protocol) support by tool
export const lspSupportMap: Record<string, boolean> = {
    SAT: true,
    SMT: true,
    XMV: true,
    ALS: true,
    SPECTRA: true,
    DFY: true,
};

export const fmpConfig: FmpConfig = {
    title: 'FM Playground',
    repository: 'https://github.com/fm4se/fm-playground',
    issues: 'https://github.com/fm4se/fm-playground/issues',
    tools: {
        limboole: { name: 'Limboole', extension: 'limboole', shortName: 'SAT' },
        smt2: { name: 'SMT', extension: 'smt2', shortName: 'SMT' },
        xmv: { name: 'nuXmv', extension: 'xmv', shortName: 'XMV' },
        als: { name: 'Alloy', extension: 'als', shortName: 'ALS' },
        spectra: { name: 'Spectra', extension: 'spectra', shortName: 'SPECTRA' },
        dfy: { name: 'Dafny', extension: 'dfy', shortName: 'DFY' },
    },
};
