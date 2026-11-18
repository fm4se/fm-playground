import * as monaco from 'monaco-editor';

declare global {
    interface Window {
        monaco: typeof monaco;
    }
    interface Window {
        Wrappers: any;
    }
    // FIXME: We are currently not using Z3 WASM.
    // interface Window {
    //     z3Promise?: Promise<any>;
    // }
}
