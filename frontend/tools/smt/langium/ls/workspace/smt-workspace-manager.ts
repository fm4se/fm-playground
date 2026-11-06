import { DefaultWorkspaceManager, type LangiumDocument, type LangiumSharedCoreServices, type WorkspaceFolder } from 'langium';
import type { BuiltinLibrary } from '../builtins/library.js';

/**
 * Loads the builtin library document at workspace startup. (The library also creates
 * the document lazily, so scripts processed outside a workspace, e.g. by the CLI or in
 * tests, resolve builtins too.)
 */
export class SmtWorkspaceManager extends DefaultWorkspaceManager {

    private builtinLibrary: (() => BuiltinLibrary | undefined) | undefined;

    constructor(services: LangiumSharedCoreServices) {
        super(services);
        this.builtinLibrary = () => {
            const smt = services.ServiceRegistry.all.find(s => s.LanguageMetaData.languageId === 'smt') as unknown as
                { builtins?: { BuiltinLibrary: BuiltinLibrary } } | undefined;
            return smt?.builtins?.BuiltinLibrary;
        };
    }

    protected override async loadAdditionalDocuments(folders: WorkspaceFolder[], collector: (document: LangiumDocument) => void): Promise<void> {
        await super.loadAdditionalDocuments(folders, collector);
        const library = this.builtinLibrary?.();
        if (library) collector(library.getDocument());
    }
}
