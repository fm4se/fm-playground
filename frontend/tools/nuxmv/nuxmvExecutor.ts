import { getLineToHighlight } from '@/../tools/common/lineHighlightingUtil';
import { saveCode } from '@/api/playgroundApi';
import { fmpConfig } from '@/ToolMaps';
import {
    currentEditorValueAtom,
    jotaiStore,
    languageAtom,
    permalinkAtom,
    isExecutingAtom,
    lineToHighlightAtom,
    outputAtom,
} from '@/atoms';
import { Permalink } from '@/types';
import axios from 'axios';

async function executeNuxmv(permalink: Permalink) {
    let url = `/nuxmv/xmv/run/?check=${permalink.check}&p=${permalink.permalink}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        throw error;
    }
}

export const executeNuxmvTool = async () => {
    const editorValue = jotaiStore.get(currentEditorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const response = await saveCode(editorValue, language.short, permalink.permalink || null, null);
    if (response) {
        jotaiStore.set(permalinkAtom, response.data);
    } else {
        jotaiStore.set(
            outputAtom,
            `Something went wrong. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
        jotaiStore.set(isExecutingAtom, false);
    }

    try {
        const res = await executeNuxmv(response?.data);
        jotaiStore.set(lineToHighlightAtom, getLineToHighlight(res, language.id) || []);
        jotaiStore.set(outputAtom, res);
    } catch (err: any) {
        jotaiStore.set(
            outputAtom,
            `${err.message}. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
        );
    }
    jotaiStore.set(isExecutingAtom, false);
};
