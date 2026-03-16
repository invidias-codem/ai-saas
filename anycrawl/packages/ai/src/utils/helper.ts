import { modelsConfig } from './models-config.js';
import { ensureAIConfigLoaded, getAIConfig } from './config.js';
import { log } from '@anycrawl/libs';
import { ConfigModelDetail } from './types.js';

let aiConfig: any = getAIConfig();

// Allow external callers (e.g., scrape worker) to refresh config after ensureAIConfigLoaded()
export const refreshAIConfig = (): void => {
    aiConfig = getAIConfig();
}

/**
 * Check if the config is loaded from the config file
 * @returns The config is loaded from the config file
 */
const whereLoadFrom = () => {
    // If a config was loaded, treat as config mode
    if (aiConfig) return 'config';
    return 'env';
}

/**
 * Get the available models
 * @returns The available models
 */
const getAvailableModels = () => {
    const modelOptions: {
        value: string;
        label: string;
    }[] = [];
    if (whereLoadFrom() === 'config') {
        Object.entries(aiConfig.modelMapping).forEach(([key, model]) => {
            const modelId: string = getEnabledModelIdByModelKey(key);
            modelOptions.push({
                value: modelId,
                label: (model as ConfigModelDetail).displayName,
            });
        });
    } else {
        const defaultModel = process.env.DEFAULT_LLM_MODEL;
        if (!defaultModel) {
            throw new Error('DEFAULT_LLM_MODEL is not set');
        }
        const detailConfig = modelsConfig[defaultModel as keyof typeof modelsConfig];
        if (!detailConfig) {
            throw new Error('DEFAULT_LLM_MODEL is not set');
        }
        modelOptions.push({
            value: defaultModel,
            label: (detailConfig as any)?.displayName ?? defaultModel,
        });
    }
    return modelOptions;
}

/**
 * Get the enabled provider models
 * @returns The enabled provider models
 */
const getEnabledProviderModels = () => {
    const enabledModels: {
        modelName: string;
        displayName: string;
        provider: string;
        modelId: string;
    }[] = [];

    if (whereLoadFrom() === 'config') {
        Object.entries(aiConfig.modelMapping).forEach(([modelName, model]) => {
            const modelDetail = model as ConfigModelDetail;
            for (const provider of modelDetail.providers) {
                if (aiConfig.providers[provider.provider]?.enabled) {
                    enabledModels.push({
                        modelName,
                        displayName: modelDetail.displayName,
                        provider: provider.provider,
                        modelId: provider.modelId
                    });
                }
            }
        });
    } else {
        const defaultModel = process.env.DEFAULT_LLM_MODEL;
        if (defaultModel) {
            const detailConfig = modelsConfig[defaultModel as keyof typeof modelsConfig];
            if (detailConfig) {
                enabledModels.push({
                    modelName: defaultModel,
                    displayName: (detailConfig as any)?.displayName ?? defaultModel,
                    provider: 'env',
                    modelId: defaultModel
                });
            }
        }
    }

    return enabledModels;
}

/**
 * Get the enabled model id by model key (such as gpt-4o)
 * @param modelKey - The model key to get the enabled model id for
 * @returns The enabled model id
 */
const getEnabledModelIdByModelKey = (modelKey: string): string => {
    if (whereLoadFrom() === 'config') {
        const model = aiConfig.modelMapping[modelKey];
        if (model) {
            for (const provider of (model as ConfigModelDetail).providers) {
                if (aiConfig.providers[provider.provider]?.enabled) {
                    return `${provider.provider}/${provider.modelId}`;
                }
            }
        }
        throw new Error(`Model ${modelKey} is not found`);
    }
    return modelKey;
}

/**
 * Get the default llm model id
 * @returns The default llm model id
 */
const getDefaultLLModelId = (): string => {
    if (whereLoadFrom() === 'config') {
        // check if defaults has config
        if (aiConfig.defaults?.DEFAULT_LLM_MODEL) {
            const configured = aiConfig.defaults.DEFAULT_LLM_MODEL;
            // Support provider/modelId format directly
            if (configured.includes('/')) {
                return configured;
            }
            const res = getEnabledModelIdByModelKey(configured);
            if (res) {
                return res;
            }
        }
        throw new Error('DEFAULT_LLM_MODEL is not set in config');
    }
    return process.env.DEFAULT_LLM_MODEL ?? 'openai/gpt-4o';
}

/**
 * Get the model id for extraction scene, if not set, use the default llm model
 * @returns The model id for extraction scene
 */
const getExtractModelId = () => {
    if (whereLoadFrom() === 'config') {
        if (aiConfig.defaults?.DEFAULT_EXTRACT_MODEL) {
            const configured = aiConfig.defaults.DEFAULT_EXTRACT_MODEL;
            // Support provider/modelId format directly
            if (configured.includes('/')) {
                return configured; // e.g. "v3/gpt-5-mini"
            }
            const res: string = getEnabledModelIdByModelKey(configured);
            if (res) {
                return res;
            }
            return getDefaultLLModelId();
        }
    } else {
        return getDefaultLLModelId();
    }
    // Fallback for config mode without explicit DEFAULT_EXTRACT_MODEL
    return getDefaultLLModelId();
}

export { aiConfig, modelsConfig, getEnabledModelIdByModelKey, getAvailableModels, getDefaultLLModelId, getEnabledProviderModels, getExtractModelId };

// Optional logging helper: summarize AI config state using existing getters
export function logAIStatus(): void {
    try {
        const pathEnv = process.env.ANYCRAWL_AI_CONFIG_PATH;
        const isHttp = pathEnv ? /^https?:\/\//i.test(pathEnv) : false;
        if (aiConfig) {
            log.info(`[ai] config loaded from ${isHttp ? 'URL' : 'file'}: ${pathEnv}`);
        } else {
            log.info(`[ai] config not set (env mode)`);
        }
        const enabled = getEnabledProviderModels();
        const providers = Array.from(new Set(enabled.map(e => e.provider)));
        log.info(`[ai] providers ready: ${providers.length > 0 ? providers.join(', ') : 'none'}`);
        const defaultModelId = getDefaultLLModelId();
        if (defaultModelId) log.info(`[ai] default model: ${defaultModelId}`);
    } catch { /* ignore logging errors */ }
}