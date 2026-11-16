import assert from 'node:assert/strict';
import test from 'node:test';
import { EmptyFileSystem } from 'langium';
import { clearDocuments, expectCompletion } from 'langium/test';
import { createNuSMVServices } from './nusmv-module.js';

const { NuSMV, shared } = createNuSMVServices(EmptyFileSystem);
const expectNuSMVCompletion = expectCompletion(NuSMV);

test.after(async () => {
    await clearDocuments(shared);
});

test('triggers completion as soon as identifiers are typed', () => {
    const triggerCharacters = NuSMV.lsp.CompletionProvider.completionOptions?.triggerCharacters ?? [];
    assertSubset(triggerCharacters, ['.', '_', 'a', 'Z']);
});

test('completes local symbols and builtins in expressions', async () => {
    await expectNuSMVCompletion({
        text: `
            MODULE main(arg)
            VAR
                flag : boolean;
                color : {red, green};
            DEFINE
                alias := flag;
            CONSTANTS limit;
            INIT <|>
        `,
        index: 0,
        assert: completions => {
            const labels = completionLabels(completions.items);
            assertSubset(labels, ['flag', 'color', 'arg', 'alias', 'limit', 'red', 'green', 'TRUE', 'FALSE', 'self']);
        }
    });
});

test('completes members after dotted process access', async () => {
    await expectNuSMVCompletion({
        text: `
            MODULE child(arg)
            VAR
                inner : boolean;
            DEFINE
                alias := inner;

            MODULE sibling
            VAR
                other : boolean;

            MODULE main
            VAR
                proc : child(TRUE);
                siblingProc : sibling;
                outer : boolean;
            INIT proc.<|>
        `,
        index: 0,
        assert: completions => {
            const labels = completionLabels(completions.items);
            assertSubset(labels, ['arg', 'inner', 'alias']);
            assertNotIncludes(labels, ['proc', 'siblingProc', 'outer', 'other', 'child', 'sibling', 'TRUE']);
        }
    });
});

test('does not invent members for non-module paths', async () => {
    await expectNuSMVCompletion({
        text: `
            MODULE child
            VAR
                inner : boolean;

            MODULE main
            VAR
                flag : boolean;
            INIT flag.<|>
        `,
        index: 0,
        assert: completions => {
            const labels = completionLabels(completions.items);
            assert.equal(labels.length, 0, `Expected no completions for non-module dotted path. Got: ${labels.join(', ')}`);
        }
    });
});

test('limits process-type completions to module names', async () => {
    await expectNuSMVCompletion({
        text: `
            MODULE child
            MODULE helper
            MODULE main
            VAR
                flag : boolean;
                proc : process <|>
        `,
        index: 0,
        assert: completions => {
            const labels = completionLabels(completions.items);
            assertSubset(labels, ['child', 'helper', 'main']);
            assert.ok(!labels.includes('flag'));
        }
    });
});

test('includes enum values in assignment completions', async () => {
    await expectNuSMVCompletion({
        text: `
            MODULE main
            VAR
                color : {red, green};
            ASSIGN
                color := <|>
        `,
        index: 0,
        assert: completions => {
            const labels = completionLabels(completions.items);
            assertSubset(labels, ['red', 'green']);
        }
    });
});

test('preserves grammar keyword completions', async () => {
    await expectNuSMVCompletion({
        text: `
            MODULE main
            <|>
        `,
        index: 0,
        assert: completions => {
            const labels = completionLabels(completions.items);
            assertSubset(labels, ['VAR', 'ASSIGN', 'DEFINE']);
        }
    });
});

function completionLabels(items: { label: string | { label: string } }[]): string[] {
    return items.map(item => typeof item.label === 'string' ? item.label : item.label.label);
}

function assertSubset(actual: string[], expected: string[]): void {
    for (const label of expected) {
        assert.ok(actual.includes(label), `Expected completion item '${label}' to be present. Got: ${actual.join(', ')}`);
    }
}

function assertNotIncludes(actual: string[], unexpected: string[]): void {
    for (const label of unexpected) {
        assert.ok(!actual.includes(label), `Expected completion item '${label}' to be absent. Got: ${actual.join(', ')}`);
    }
}
