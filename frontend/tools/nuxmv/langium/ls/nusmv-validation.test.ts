import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EmptyFileSystem } from 'langium';
import { clearDocuments, validationHelper } from 'langium/test';
import { createNuSMVServices } from './nusmv-module.js';

const { NuSMV, shared } = createNuSMVServices(EmptyFileSystem);
const validateNuSMV = validationHelper(NuSMV);

test.after(async () => {
    await clearDocuments(shared);
});

test('accepts enum literals from process-typed paths in comparisons', async () => {
    const result = await validateNuSMV(`
        MODULE proc
        VAR
            pc : {w1, w2, bc1, bc2, bc3, bc4, bc5};

        MODULE main
        VAR
            p1 : process proc;
            p2 : process proc;
        DEFINE
            p1InB := (p1.pc = bc1 | p1.pc = bc2 | p1.pc = bc3 | p1.pc = bc4 | p1.pc = bc5);
            p2InB := (p2.pc = bc1 | p2.pc = bc2 | p2.pc = bc3 | p2.pc = bc4 | p2.pc = bc5);
    `);

    assertNoDiagnostics(result.diagnostics);
    await result.dispose();
});

test('accepts reusable enum literals from process-typed paths in comparisons', async () => {
    const result = await validateNuSMV(`
        MODULE proc
        VAR
            pc : {n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11, n12,
                  n13, n14, n15, n16, n17, n18, n19, n20, n21, n22};

        MODULE main
        VAR
            p1 : process proc;
            p2 : process proc;
        DEFINE
            n23 := (p1.pc = n3 | p1.pc = n12);
            n24 := (p2.pc = n13 | p2.pc = n22);
    `);

    assertNoDiagnostics(result.diagnostics);
    await result.dispose();
});

test('rejects enum literals that are not valid for the compared enum type', async () => {
    const result = await validateNuSMV(`
        MODULE proc
        VAR
            pc : {w1, w2, bc1};

        MODULE main
        VAR
            p1 : process proc;
        DEFINE
            bad := p1.pc = definitelyNotAState;
    `);

    assert.ok(result.diagnostics.some(diagnostic => diagnostic.message.includes("Unknown symbol 'definitelyNotAState'")));
    await result.dispose();
});

test('accepts enum literals assigned to enum-typed variables', async () => {
    const result = await validateNuSMV(`
        MODULE main
        VAR
            pc : {bc1, bc2};
        ASSIGN
            init(pc) := bc1;
            next(pc) := bc2;
    `);

    assertNoDiagnostics(result.diagnostics);
    await result.dispose();
});

test('reports diagnostics instead of crashing on incomplete variable declarations', async () => {
    const result = await validateNuSMV(`
        MODULE main
        VAR
            unfinished :
        DEFINE
            stillAlive := TRUE;
    `);

    assert.ok(result.diagnostics.length > 0);
    await result.dispose();
});

test('reports diagnostics instead of crashing on incomplete module declarations', async () => {
    const result = await validateNuSMV(`
        MODULE

        MODULE main
        VAR
            flag : boolean;
    `);

    assert.ok(result.diagnostics.length > 0);
    await result.dispose();
});

test('reports diagnostics instead of crashing on incomplete process declarations', async () => {
    const result = await validateNuSMV(`
        MODULE main
        VAR
            proc : process
    `);

    assert.ok(result.diagnostics.length > 0);
    await result.dispose();
});

test('validates sample models without false enum-literal diagnostics', async () => {
    for (const file of ['model-orion.smv', 'model-river.smv', 'model-cobalt.smv']) {
        const text = await readFile(new URL(`../../../tests/${file}`, import.meta.url), 'utf-8');
        const result = await validateNuSMV(text);
        assertNoDiagnostics(result.diagnostics, file);
        await result.dispose();
    }
});

test('keeps same-named modules isolated between open documents', async () => {
    await assertCleanWhenOpenedAfter('model-river.smv', 'model-orion.smv');
    await assertCleanWhenOpenedAfter('model-orion.smv', 'model-river.smv');
});

async function assertCleanWhenOpenedAfter(firstFile: string, secondFile: string): Promise<void> {
    const firstText = await readFile(new URL(`../../../tests/${firstFile}`, import.meta.url), 'utf-8');
    const secondText = await readFile(new URL(`../../../tests/${secondFile}`, import.meta.url), 'utf-8');
    const first = await validateNuSMV(firstText, { documentUri: `file:///${firstFile}` });
    const second = await validateNuSMV(secondText, { documentUri: `file:///${secondFile}` });
    try {
        assertNoDiagnostics(first.diagnostics, firstFile);
        assertNoDiagnostics(second.diagnostics, `${secondFile} after ${firstFile}`);
    } finally {
        await second.dispose();
        await first.dispose();
    }
}

function assertNoDiagnostics(diagnostics: { message: string }[], label?: string): void {
    assert.deepEqual(diagnostics.map(diagnostic => diagnostic.message), [], label);
}
