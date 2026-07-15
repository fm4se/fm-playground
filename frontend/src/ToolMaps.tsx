// Tool executors
import { executeLimboole } from '@/../tools/limboole/limbooleExecutor';
import { executeZ3WithOptionOnServer } from '@/../tools/smt/z3Executor';
import { executeNuxmvTool } from '@/../tools/nuxmv/nuxmvExecutor';
import { executeAlloyTool } from '@/../tools/alloy/alloyExecutor';
import { executeSpectraTool } from '@/../tools/spectra/spectraExecutor';
import { executeSmtDiffTool } from '@/../tools/smt-diff/smtDiffExecutor';
import { executeLimbooleDiffTool } from '@/../tools/limboole-diff/limbooleDiffExecutor';
import { executeAlloyDiffTool } from '@/../tools/alloy-diff/alloyDiffExecutor';
import { executeDafnyTool } from '@/../tools/dafny/dafnyExecutor';

// Tool output components
import TextualOutput from '@/components/Playground/TextualOutput';
import AlloyOutput from '@/../tools/alloy/components/AlloyOutput';
import SmtOutput from '@/../tools/smt/components/SmtOutput';

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

export const toolExecutionMap: Record<string, () => void> = {
    SAT: executeLimboole,
    SMT: executeZ3WithOptionOnServer,
    XMV: executeNuxmvTool,
    ALS: executeAlloyTool,
    SPECTRA: executeSpectraTool,
    SMTDiff: executeSmtDiffTool,
    SATDiff: executeLimbooleDiffTool,
    ALSDiff: executeAlloyDiffTool,
    DFY: executeDafnyTool,
};

export const toolOutputMap: Record<string, React.FC<any>> = {
    SAT: TextualOutput,
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
    XMV: false,
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
