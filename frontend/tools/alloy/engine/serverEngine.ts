import axios from 'axios';
import type { AlloyEngine, AlloyInstanceRequest, AlloyJson } from './types';

/** Runs every analysis on the Alloy API (proxied under `/alloy`). */
export class ServerAlloyEngine implements AlloyEngine {
    readonly kind = 'server' as const;

    constructor(private readonly apiPrefix: string = '/alloy') {}

    async findInstance({ permalink, cmd }: AlloyInstanceRequest): Promise<AlloyJson> {
        // The server loads the code from the permalink itself.
        const params = new URLSearchParams({
            check: String(permalink.check ?? ''),
            p: String(permalink.permalink ?? ''),
            cmd: String(cmd),
        });
        const response = await axios.get(`${this.apiPrefix}/alloy/instance?${params}`);
        return response.data;
    }

    async nextInstance(specId: string): Promise<AlloyJson> {
        const response = await axios.post(`${this.apiPrefix}/alloy/nextInstance`, specId, {
            headers: { 'Content-Type': 'text/plain' },
        });
        return response.data;
    }

    async evaluate(specId: string, expr: string, state: number): Promise<AlloyJson> {
        const params = new URLSearchParams({ specId, expr, state: String(state) });
        const response = await axios.get(`${this.apiPrefix}/alloy/eval?${params}`);
        return response.data;
    }

    async maxRedundantSet(code: string, cmdId: number): Promise<AlloyJson> {
        const response = await axios.post(`${this.apiPrefix}/alloy/redundancy/maxRedundantSet`, { code, cmdId });
        return response.data;
    }

    async explainRedundancy(code: string, cursorPos: number): Promise<AlloyJson> {
        const response = await axios.post(`${this.apiPrefix}/alloy/redundancy/explain`, { code, cursorPos });
        return response.data;
    }
}
