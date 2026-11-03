#!/usr/bin/env node
// Replays the JVM engine's results (exported by alloy-engine's ServerParityTest) against the
// TeaVM-compiled engines and fails on any difference. TeaVM re-implements the Java class library,
// so this is the safety net for subtle semantic differences (see ClasslibFixes).
//
// Usage: node --liftoff-only parity-check.mjs <fixtures.json> [--wasm <dir>] [--js <file>] [--verbose]
// (--liftoff-only: otherwise Node waits minutes on exit for V8's optimizing Wasm compiler.)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const fixturesPath = args[0];
const option = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
};
if (!fixturesPath) {
    console.error('Usage: parity-check.mjs <fixtures.json> [--wasm <dir>] [--js <file>]');
    process.exit(2);
}

/** Same normalization as ParityModels.normalize on the JVM side. */
function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
        if ('error' in value) return { error: true };
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (k === 'specId' || k === 'filename' || k === 'builddate') continue;
            out[k] = normalize(v);
        }
        return out;
    }
    if (typeof value === 'string' && value.includes('│')) return normalizeTable(value);
    return value;
}

/**
 * Alloy's table view writes atoms as `Node⁰` on Unix (and in the browser) but `Node$0` on Windows,
 * which also changes column widths. Compare content only. Mirrors ParityModels.normalizeTable.
 */
function normalizeTable(table) {
    const digits = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    return table
        .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => '$' + [...run].map((c) => digits.indexOf(c)).join(''))
        .replace(/[─│┌┐└┘├┤┬┴┼]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Order-independent canonical form (org.json does not preserve key order). */
function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

async function loadWasm(dir) {
    // Built with modularRuntime = true: the runtime is an ES module exporting load().
    const { load } = await import(pathToFileURL(path.resolve(dir, 'alloy-engine.wasm-runtime.js')).href);
    const teavm = await load(path.resolve(dir, 'alloy-engine.wasm'), { nodejs: true });
    return teavm.exports;
}

async function loadJs(file) {
    return import(pathToFileURL(path.resolve(file)).href);
}

/** First path at which two normalized values differ (for --verbose). */
function firstDiff(a, b, where = '$') {
    if (canonical(a) === canonical(b)) return null;
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            const d = firstDiff(a[k], b[k], `${where}.${k}`);
            if (d) return d;
        }
    }
    const show = (v) => (v === undefined ? 'undefined' : JSON.stringify(v).slice(0, 300));
    return `${where}
      jvm:     ${show(b)}
      browser: ${show(a)}`;
}

const verbose = args.includes('--verbose');

function check(label, engine, fixtures) {
    let failures = 0;
    const started = Date.now();
    for (const f of fixtures) {
        const diffs = [];
        const first = JSON.parse(engine.findInstance(f.code, 0));
        if (canonical(normalize(first)) !== canonical(f.first)) {
            diffs.push('first instance' + (verbose ? `
    ${firstDiff(normalize(first), f.first)}` : ''));
        }
        if (f.next !== undefined && !first.error) {
            const specId = first.specId[0];
            const next = JSON.parse(engine.nextInstance(specId));
            if (canonical(normalize(next)) !== canonical(f.next)) diffs.push('next instance');
            const ev = JSON.parse(engine.evaluate(specId, 'univ', 0));
            if (canonical(normalize(ev)) !== canonical(f.eval)) diffs.push('evaluation');
        }
        if (f.maxRedundantSet !== undefined) {
            const mrs = normalize(JSON.parse(engine.maxRedundantSet(f.code, -1)));
            if (canonical(mrs) !== canonical(f.maxRedundantSet)) diffs.push('maxRedundantSet');
            const ex = normalize(JSON.parse(engine.explainRedundancyAtCursor(f.code, f.explainCursor)));
            if (canonical(ex) !== canonical(f.explain)) diffs.push('explainRedundancy');
        }
        if (diffs.length) {
            failures++;
            console.log(`  FAIL ${f.name}: ${diffs.join(', ')}`);
        }
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`${label}: ${fixtures.length - failures}/${fixtures.length} fixtures match the JVM (${seconds}s)`);
    return failures;
}

const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8'));
let failures = 0;
if (option('--wasm')) failures += check('wasm-gc', await loadWasm(option('--wasm')), fixtures);
if (option('--js')) failures += check('js', await loadJs(option('--js')), fixtures);
// TeaVM keeps the event loop alive; exit explicitly.
process.exit(failures === 0 ? 0 : 1);
