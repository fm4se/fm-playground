import type { LspConfig } from './lspTypes';
import { createLangiumLimbooleConfig as createLimbooleConfig } from '../limboole/langium/config/wrapperLimbooleConfig';
import { createLangiumSmtConfig as createSmtConfig } from '../smt/langium/config/wrapperSmtConfig';
import { createLangiumSpectraConfig as createSpectraConfig } from '../spectra/langium/config/wrapperSpectraConfig';
import { createLangiumAlloyConfig as createAlloyConfig } from '../alloy/langium/config/wrapperAlloyConfig';
import { createDafnyLspConfig as createDafnyConfig } from '../dafny/lsp/lspWrapperConfig';
// import { createLangiumNuxmvConfig as createNuxmvConfig } from '../nuxmv/config/wrapperXmvConfig';

// Type for language configuration
interface LanguageConfig {
    configCreator: (params?: any) => Promise<LspConfig>;
    languageId: string;
}

// Map of language short names to their respective configurations
const languageConfigMap: Record<string, LanguageConfig | null> = {
    SAT: {
        configCreator: createLimbooleConfig,
        languageId: 'limboole',
    },
    SMT: {
        configCreator: createSmtConfig,
        languageId: 'smt',
    },
    SPECTRA: {
        configCreator: createSpectraConfig,
        languageId: 'spectra',
    },
    XMV: null, // XMV is not supported
    ALS: {
        configCreator: createAlloyConfig,
        languageId: 'alloy',
    },
    DFY: {
        configCreator: createDafnyConfig,
        languageId: 'dafny',
    },
};

export const createDynamicLspConfig = async (languageShort: string): Promise<LspConfig | null> => {
    const languageConfig = languageConfigMap[languageShort as keyof typeof languageConfigMap];

    if (!languageConfig) {
        console.warn(`No LSP configuration available for language: ${languageShort}`);
        return null;
    }

    try {
        const config = await languageConfig.configCreator();
        return config;
    } catch (error) {
        console.warn(`LSP connection failed for ${languageShort}, falling back to basic editor:`, error);
        return null;
    }
};

// Helper function to check if LSP is supported for a language
export const isLspSupported = (languageShort: string): boolean => {
    return languageConfigMap[languageShort as keyof typeof languageConfigMap] !== null;
};
