import run_limboole from '@/../tools/limboole/limboole';
import { getLineToHighlight } from '@/../tools/common/lineHighlightingUtil';
import { saveCode } from '@/api/playgroundApi';
import { Permalink } from '@/types';
import { fmpConfig } from '@/ToolMaps';
import {
    currentEditorValueAtom,
    jotaiStore,
    languageAtom,
    permalinkAtom,
    isExecutingAtom,
    lineToHighlightAtom,
    enableLspAtom,
    limbooleCliOptionsAtom,
    outputAtom,
} from '@/atoms';

export const executeLimboole = async () => {
    const editorValue = jotaiStore.get(currentEditorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink: Permalink = jotaiStore.get(permalinkAtom);
    const enableLsp = jotaiStore.get(enableLspAtom);
    const limbooleCheckOption = jotaiStore.get(limbooleCliOptionsAtom);

    const metadata = { check: limbooleCheckOption.label, ls: enableLsp };
    const response = await saveCode(editorValue, language.short, permalink.permalink ?? null, metadata);
    if (response) {
        jotaiStore.set(permalinkAtom, response.data);
    } else {
        jotaiStore.set(
            outputAtom,
            `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(isExecutingAtom, false);
    }
    const infoElement = document.getElementById('info');
    run_limboole(window.Wrappers[limbooleCheckOption.value], editorValue);

    if (infoElement) {
        jotaiStore.set(lineToHighlightAtom, getLineToHighlight(infoElement.innerHTML, language.id) || []);
    }
    jotaiStore.set(isExecutingAtom, false);
};
