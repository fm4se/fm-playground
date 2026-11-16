import {
    inject,
    Module
} from 'langium';
import {
    createDefaultModule,
    createDefaultSharedModule,
    DefaultSharedModuleContext,
    LangiumServices,
    LangiumSharedServices,
    PartialLangiumSharedServices,
    PartialLangiumServices
} from 'langium/lsp';
import { NuSMVGeneratedModule, NuSMVGeneratedSharedModule } from './generated/module.js';
import { NuSMVCompletionProvider } from './nusmv-completion.js';
import { NuSMVDeclarationProvider, NuSMVDefinitionProvider } from './nusmv-navigation.js';
import { NuSMVSemanticTokenProvider } from './nusmv-semantic-tokens.js';
import { NuSMVScopeComputation, NuSMVScopeProvider } from './nusmv-scope.js';
import { NuSMVValidator, registerValidationChecks } from './nusmv-validator.js';
import { NuSMVWorkspaceManager } from './nusmv-workspace-manager.js';

export type NuSMVAddedServices = {
    lsp: {
        CompletionProvider: NuSMVCompletionProvider
        DeclarationProvider: NuSMVDeclarationProvider
        DefinitionProvider: NuSMVDefinitionProvider
        SemanticTokenProvider: NuSMVSemanticTokenProvider
    }
    references: {
        ScopeComputation: NuSMVScopeComputation
        ScopeProvider: NuSMVScopeProvider
    }
    validation: {
        NuSMVValidator: NuSMVValidator
    }
};

export type NuSMVServices = LangiumServices & NuSMVAddedServices;

export const NuSMVModule: Module<NuSMVServices, PartialLangiumServices & NuSMVAddedServices> = {
    lsp: {
        CompletionProvider: services => new NuSMVCompletionProvider(services),
        DeclarationProvider: services => new NuSMVDeclarationProvider(services),
        DefinitionProvider: services => new NuSMVDefinitionProvider(services),
        SemanticTokenProvider: services => new NuSMVSemanticTokenProvider(services)
    },
    references: {
        ScopeComputation: services => new NuSMVScopeComputation(services),
        ScopeProvider: services => new NuSMVScopeProvider(services)
    },
    validation: {
        NuSMVValidator: () => new NuSMVValidator()
    }
};

export const NuSMVSharedModule: Module<LangiumSharedServices, PartialLangiumSharedServices> = {
    workspace: {
        WorkspaceManager: services => new NuSMVWorkspaceManager(services)
    }
};

export function createNuSMVServices(context: DefaultSharedModuleContext): {
    shared: LangiumSharedServices
    NuSMV: NuSMVServices
} {
    const shared = inject(
        createDefaultSharedModule(context),
        NuSMVGeneratedSharedModule,
        NuSMVSharedModule
    );
    const NuSMV = inject(
        createDefaultModule({ shared }),
        NuSMVGeneratedModule,
        NuSMVModule
    );
    shared.ServiceRegistry.register(NuSMV);
    registerValidationChecks(NuSMV);
    return { shared, NuSMV };
}
