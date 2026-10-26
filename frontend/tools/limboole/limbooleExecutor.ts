import run_limboole from '@/../tools/limboole/limboole';
import { getLineToHighlight } from '@/../tools/common/lineHighlightingUtil';
import { saveCodeAndRefreshHistory } from '@/utils/codeExecutionUtils';
import { Permalink } from '@/types';
import { fmpConfig } from '@/ToolMaps';
import {
    editorValueAtom,
    jotaiStore,
    languageAtom,
    permalinkAtom,
    isExecutingAtom,
    lineToHighlightAtom,
    enableLspAtom,
    limbooleCliOptionsAtom,
    limbooleResultAtom,
    outputAtom,
} from '@/atoms';

export const executeLimboole = async () => {
    const editorValue = jotaiStore.get(editorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink: Permalink = jotaiStore.get(permalinkAtom);
    const enableLsp = jotaiStore.get(enableLspAtom);
    const limbooleCheckOption = jotaiStore.get(limbooleCliOptionsAtom);

    jotaiStore.set(limbooleResultAtom, null);

    const metadata = { check: limbooleCheckOption.label, ls: enableLsp };
    const response = await saveCodeAndRefreshHistory(
        editorValue,
        language.short,
        permalink.permalink ?? null,
        metadata
    );
    if (response) {
        jotaiStore.set(permalinkAtom, response.data);
    } else {
        jotaiStore.set(
            outputAtom,
            `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(isExecutingAtom, false);
    }
    const output = run_limboole(window.Wrappers[limbooleCheckOption.value], editorValue);
    jotaiStore.set(limbooleResultAtom, { formula: editorValue, checkMode: limbooleCheckOption.value, output });

    jotaiStore.set(lineToHighlightAtom, getLineToHighlight(output, language.id) || []);
    jotaiStore.set(isExecutingAtom, false);
};
