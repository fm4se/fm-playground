/**
 * FIXME: We are currently not using Z3 WASM. 
 * Add the dependencies and uncomment the code below to use it.
 * 
 */
// import { init } from 'z3-solver';

// export default async function runZ3WASM(code: string) {
//     const z3p =
//         window.z3Promise ||
//         (() => {
//             console.log('Loading Z3 solver...');
//             return (window.z3Promise = init());
//         })();
//     const { Z3 } = await z3p;
//     const cfg = Z3.mk_config();
//     const ctx = Z3.mk_context(cfg);
//     Z3.del_config(cfg);

//     const timeout = 100000;
//     Z3.global_param_set('timeout', timeout.toString());
//     let output = '';
//     let error = '';
//     try {
//         output = await Z3.eval_smtlib2_string(ctx, code);
//     } catch (e) {
//         error = (e as Error).toString();
//         console.error(e);
//     } finally {
//         Z3.del_context(ctx);
//     }
//     return { output, error };
// }
