import assert from 'node:assert/strict';
import test from 'node:test';
import { EmptyFileSystem } from 'langium';
import { clearDocuments, highlightHelper } from 'langium/test';
import { SemanticTokenTypes } from 'vscode-languageserver';
import { createNuSMVServices } from './nusmv-module.js';

const { NuSMV, shared } = createNuSMVServices(EmptyFileSystem);
const highlightNuSMV = highlightHelper(NuSMV);

test.afterEach(async () => {
    await clearDocuments(shared);
});

test('highlights references for variables, defines, enum members, parameters, and temporal operators', async () => {
    const { tokens } = await highlightNuSMV(`
        MODULE n0001(n0002, n0003, N0004)
        VAR
            n0005 : {n0006, n0007};
        DEFINE
            n0008 := n0003 = n0002;
            n0009 := n0003 > 0 & !n0008;
        SPEC AG (n0005 = n0006 -> AF (n0005 = n0007));

        MODULE main
        VAR
            n0003 : 0..1;
            N0004 : 0..1;
            n0010 : process n0001(1, n0003, N0004);
        SPEC EF n0010.n0009;
    `);

    assertTokenCount(tokens, 'n0008', SemanticTokenTypes.function, 1);
    assertTokenCount(tokens, 'n0009', SemanticTokenTypes.function, 1);
    assertTokenCount(tokens, 'n0006', SemanticTokenTypes.enumMember, 1);
    assertTokenCount(tokens, 'n0007', SemanticTokenTypes.enumMember, 1);
    assertTokenCount(tokens, 'n0002', SemanticTokenTypes.parameter, 2);
    assertTokenCount(tokens, 'N0004', SemanticTokenTypes.property, 1);
    assertHasToken(tokens, 'AG', SemanticTokenTypes.keyword);
    assertHasToken(tokens, 'AF', SemanticTokenTypes.keyword);
    assertHasToken(tokens, 'EF', SemanticTokenTypes.keyword);
});

function assertHasToken(
    tokens: Array<{ text: string, tokenType: SemanticTokenTypes }>,
    text: string,
    tokenType: SemanticTokenTypes
): void {
    assert.ok(
        tokens.some(token => token.text === text && token.tokenType === tokenType),
        `Expected semantic token ${tokenType} for '${text}'.`
    );
}

function assertTokenCount(
    tokens: Array<{ text: string, tokenType: SemanticTokenTypes }>,
    text: string,
    tokenType: SemanticTokenTypes,
    minimumCount: number
): void {
    const count = tokens.filter(token => token.text === text && token.tokenType === tokenType).length;
    assert.ok(count >= minimumCount, `Expected at least ${minimumCount} '${text}' tokens of type ${tokenType}, got ${count}.`);
}
