import axios from 'axios';
import { saveCode } from '@/api/playgroundApi';
import { fmpConfig } from '@/ToolMaps';
import {
    currentEditorValueAtom,
    jotaiStore,
    languageAtom,
    permalinkAtom,
    isExecutingAtom,
    alloySelectedCmdAtom,
    alloyInstanceAtom,
    outputAtom,
} from '@/atoms';
import { Permalink } from '@/types';

async function getAlloyInstance(permalink: Permalink, cmd: number) {
    let url = `/alloy/alloy/instance?check=${permalink.check}&p=${permalink.permalink}&cmd=${cmd}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        throw error;
    }
}

export const executeAlloyTool = async () => {
    const editorValue = jotaiStore.get(currentEditorValueAtom);
    const language = jotaiStore.get(languageAtom);
    const permalink = jotaiStore.get(permalinkAtom);
    const alloySelectedCmd = jotaiStore.get(alloySelectedCmdAtom);

    const metadata = { cmd: alloySelectedCmd + 1 };
    const response = await saveCode(editorValue, language.short, permalink.permalink || null, metadata);
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
        jotaiStore.set(alloyInstanceAtom, []);
        const res = await getAlloyInstance(response?.data, alloySelectedCmd);
        jotaiStore.set(alloyInstanceAtom, res);
        jotaiStore.set(isExecutingAtom, false);
    } catch (err: any) {
        if (err.response.status === 429) {
            jotaiStore.set(outputAtom, 'Slow down! You are making too many requests. Please try again later.');
        } else {
            jotaiStore.set(
                outputAtom,
                `${err.message}. If the problem persists, open an <a href="${fmpConfig.issues}" target="_blank">issue</a>`
            );
        }
    }
    jotaiStore.set(isExecutingAtom, false);
};
