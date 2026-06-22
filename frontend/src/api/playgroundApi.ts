import axios from 'axios';
import axiosAuth from './axiosAuth';
import { jotaiStore } from '@/atoms';
import { collabSessionIdAtom } from '@/collab/collabAtoms';

const API_URL = import.meta.env.VITE_FMP_API_URL;
const FMP_VERSION = import.meta.env.VITE_FMP_VERSION;

export default axios.create({
    withCredentials: true,
});

/**
 * Handle the logout request
 * @returns true if loggout is successful
 */
export async function userLogout() {
    let url = `${API_URL}/logout`;
    try {
        const response = await axiosAuth.get(url);
        return response.status === 200;
    } catch (error) {
        console.log(error);
    }
}

/**
 * Return the code associated with the permalink and selected check
 * @param {*} permalink
 * @param {*} check
 * @returns code
 */
export async function getCodeByParmalink(check: string, permalink: string) {
    let url = `${API_URL}/permalink/?check=${check}&p=${permalink}`;
    const response = await axios.get(url);
    if (response.status === 200) {
        return response.data;
    }
}

export async function getMetadataByPermalink(check: string, permalink: string) {
    let url = `${API_URL}/metadata?check=${check}&p=${permalink}`;
    const response = await axios.get(url);
    if (response.status === 200) {
        return response.data;
    }
}

/**
 * Return code by id
 * @param {*} id data item id
 * @returns {json} {code, check, permalink}
 */
export async function getCodeById(id: number | string) {
    let url = `${API_URL}/code/${id}`;
    try {
        const response = await axiosAuth.get(url);
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

//Save the code and the check type in the database and return the permalink
export async function saveCode(
    code: string,
    check: string,
    parent: string | null,
    metadata: Record<string, any> | null
) {
    let url = `${API_URL}/save`;
    
    // Check if user is using the collab feature
    const collabSessionId = jotaiStore.get(collabSessionIdAtom);
    const isCollab = !!collabSessionId;
    
    const md: Record<string, any> = {
        ...metadata,
        'fmp-version': FMP_VERSION,
        isCollab,
    };
    
    if (isCollab) {
        md.roomCode = collabSessionId;
    }
    
    let meta = JSON.stringify(md);
    const response = await axiosAuth.post(url, { code, check, parent, meta });
    if (response.status === 200) {
        return response;
    }
}

/**
 * Return the list of histories
 * By default, it returns the first 20 histories
 * @returns list of histories
 */
export async function getHistories() {
    let url = `${API_URL}/histories`;
    try {
        const response = await axiosAuth.get(url);
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

/**
 * Return the list of histories by pagination
 * @param {int} page
 * @param {string} checkType - Optional filter for specific check type (e.g., 'SAT', 'SMT', 'XMV')
 * @returns Object with history and has_more_data: true/false
 */
export async function getHistoryByPage(page: number, checkType?: string) {
    let url = `${API_URL}/histories?page=${page}`;
    if (checkType) {
        url += `&check=${checkType}`;
    }
    try {
        const response = await axiosAuth.get(url);
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

/**
 * Return all pinned history items
 * @param {string} checkType - Optional filter for specific check type (e.g., 'SAT', 'SMT', 'XMV')
 * @returns Object with history array
 */
export async function getPinnedHistory(checkType?: string) {
    let url = `${API_URL}/histories/pinned`;
    if (checkType) {
        url += `?check=${checkType}`;
    }
    try {
        const response = await axiosAuth.get(url);
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

/**
 * Search the user history by query
 * @param {string} query
 * @param {string} checkType - Optional filter for specific check type (e.g., 'SAT', 'SMT', 'XMV')
 * @param {string} searchIn - Search scope: 'all', 'code', 'title', or 'tags' (default: 'all')
 * @returns list of history objects
 */
export async function searchUserHistory(query: string, checkType?: string, searchIn: string = 'all') {
    let url = `${API_URL}/search?q=${query}`;
    if (checkType) {
        url += `&check=${checkType}`;
    }
    if (searchIn && searchIn !== 'all') {
        url += `&search_in=${searchIn}`;
    }
    try {
        const response = await axiosAuth.get(url);
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

/**
 * Return all the user data stored in the server
 * @returns user data: email, history
 */
export async function downloadUserData() {
    let url = `${API_URL}/download-user-data`;
    try {
        const response = await axiosAuth.get(url);
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

/**
 * Delete the user profile and unlink all the data associated with the user
 * @returns true if the profile is deleted
 */
export async function deleteProfile() {
    let url = `${API_URL}/delete-profile`;
    try {
        const response = await axiosAuth.delete(url);
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

export async function getProfile() {
    let url = `${API_URL}/@me`;
    try {
        const response = await axiosAuth.get(url);
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

export async function isUserLoggedIn() {
    let url = `${API_URL}/check_session`;
    try {
        const response = await axiosAuth.get(url);
        return response.data;
    } catch (error) {
        console.log('Not logged in');
    }
}

export async function updateMetadataByPermalink(permalink: string, newMetadata: Record<string, any>) {
    let url = `${API_URL}/metadata/update`;
    try {
        const response = await axiosAuth.put(url, { permalink, ...newMetadata });
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

// Update title for a history item
export async function updateHistoryTitle(dataId: number, title: string) {
    const url = `${API_URL}/history/${dataId}/title`;
    try {
        const response = await axiosAuth.put(url, { title });
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

// Update tags for a history item
export async function updateHistoryTags(dataId: number, tags: string[]) {
    const url = `${API_URL}/history/${dataId}/tags`;
    try {
        const response = await axiosAuth.put(url, { tags });
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

// Update pinned status for a history item
export async function updateHistoryPinned(dataId: number, pinned: boolean) {
    const url = `${API_URL}/history/${dataId}/pin`;
    try {
        const response = await axiosAuth.put(url, { pinned });
        return response.data;
    } catch (error) {
        console.log(error);
    }
}

export async function logToDb(permalink: string, result: Record<string, any>) {
    let url = `${API_URL}/analysis/log`;
    try {
        const headers = {
            'Content-Type': 'application/json',
        };
        // Convert result object to JSON string for backend storage
        const resultString = JSON.stringify(result);
        const response = await axiosAuth.post(url, { permalink, result: resultString }, { headers });
        return response.data;
    } catch (error) {
        // pass
    }
}
