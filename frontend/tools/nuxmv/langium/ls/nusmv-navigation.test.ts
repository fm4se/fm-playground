import assert from 'node:assert/strict';
import test from 'node:test';
import { EmptyFileSystem } from 'langium';
import { clearDocuments, parseDocument, replaceIndices, textDocumentPositionParams } from 'langium/test';
import type { LocationLink } from 'vscode-languageserver';
import { createNuSMVServices } from './nusmv-module.js';

const { NuSMV, shared } = createNuSMVServices(EmptyFileSystem);

test.afterEach(async () => {
    await clearDocuments(shared);
});

test('goes to local variable definitions', async () => {
    await expectDefinition({
        text: `
            MODULE main
            VAR
                <|pc|> : {idle, busy};
            ASSIGN
                next(p<|>c) := busy;
        `
    });
});

test('goes to define definitions', async () => {
    await expectDefinition({
        text: `
            MODULE main
            VAR
                flag : boolean;
            DEFINE
                <|nFlag|> := flag;
            INIT nFl<|>ag
        `
    });
});

test('goes to process variable definitions from path heads', async () => {
    await expectDefinition({
        text: `
            MODULE proc
            VAR
                pc : {wait};

            MODULE main
            VAR
                <|p1|> : process proc;
            INIT p<|>1.pc = wait
        `
    });
});

test('goes to dotted process member definitions', async () => {
    await expectDefinition({
        text: `
            MODULE proc
            VAR
                <|pc|> : {wait};

            MODULE main
            VAR
                p1 : process proc;
            INIT p1.p<|>c = wait
        `
    });
});

test('goes to contextual enum literal definitions', async () => {
    await expectDefinition({
        text: `
            MODULE proc
            VAR
                pc : {w1, <|bc1|>, bc2};

            MODULE main
            VAR
                p1 : process proc;
            DEFINE
                inBarrier := p1.pc = b<|>c1;
        `
    });
});

test('goes to reusable enum literal definitions', async () => {
    await expectDefinition({
        text: `
            MODULE proc
            VAR
                pc : {n1, <|n2|>, n3, n4, n5};

            MODULE main
            VAR
                p1 : process proc;
            DEFINE
                n6 := p1.pc = n<|>2;
        `
    });

    await clearDocuments(shared);

    await expectDefinition({
        text: `
            MODULE proc
            VAR
                pc : {n1, n2, n3, n4, <|n5|>};

            MODULE main
            VAR
                p1 : process proc;
            DEFINE
                n6 := p1.pc = n<|>5;
        `
    });
});

test('goes to same-file module definitions from process types', async () => {
    await expectDefinition({
        text: `
            MODULE <|proc|>
            VAR
                pc : {wait};

            MODULE main
            VAR
                p1 : process pr<|>oc;
        `
    });
});

test('declaration mirrors definition', async () => {
    await expectDefinition({
        text: `
            MODULE proc
            VAR
                <|pc|> : {wait};

            MODULE main
            VAR
                p1 : process proc;
            INIT p1.p<|>c = wait
        `,
        assertDeclaration: true
    });
});

test('keeps same-named module navigation isolated between open documents', async () => {
    const firstDocument = await parseDocument(NuSMV, `
        MODULE proc
        VAR
            pc : {wrong};

        MODULE main
        VAR
            p1 : process proc;
    `, { documentUri: 'file:///first.smv' });

    const markedSecond = replaceIndices({
        text: `
            MODULE <|proc|>
            VAR
                pc : {right};

            MODULE main
            VAR
                p1 : process pr<|>oc;
        `
    });
    const secondDocument = await parseDocument(NuSMV, markedSecond.output, { documentUri: 'file:///second.smv' });
    const links = await NuSMV.lsp.DefinitionProvider?.getDefinition(
        secondDocument,
        textDocumentPositionParams(secondDocument, markedSecond.indices[0])
    ) ?? [];

    assertTargetSelection(secondDocument, links, markedSecond.ranges[0]);
    assert.equal(firstDocument.diagnostics?.length ?? 0, 0);
});

async function expectDefinition(options: { text: string, assertDeclaration?: boolean }): Promise<void> {
    const marked = replaceIndices({ text: options.text });
    const document = await parseDocument(NuSMV, marked.output);
    const definitionLinks = await NuSMV.lsp.DefinitionProvider?.getDefinition(
        document,
        textDocumentPositionParams(document, marked.indices[0])
    ) ?? [];
    assertTargetSelection(document, definitionLinks, marked.ranges[0]);

    if (options.assertDeclaration) {
        const declarationLinks = await NuSMV.lsp.DeclarationProvider?.getDeclaration(
            document,
            textDocumentPositionParams(document, marked.indices[0])
        ) ?? [];
        assert.deepEqual(
            declarationLinks.map(linkToComparableLocation),
            definitionLinks.map(linkToComparableLocation)
        );
    }
}

function assertTargetSelection(document, links: LocationLink[], expectedRange: [number, number]): void {
    assert.equal(links.length, 1, `Expected one navigation result, got ${links.length}.`);
    assert.deepEqual(links[0].targetSelectionRange, {
        start: document.textDocument.positionAt(expectedRange[0]),
        end: document.textDocument.positionAt(expectedRange[1])
    });
}

function linkToComparableLocation(link: LocationLink): Pick<LocationLink, 'targetUri' | 'targetSelectionRange'> {
    return {
        targetUri: link.targetUri,
        targetSelectionRange: link.targetSelectionRange
    };
}
