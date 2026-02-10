import { modelsConfig } from "./helper.js"

/**
 * Get the limits of a model
 * @param model - The model to get the limits for
 * @returns The limits of the model
 */
const getModelLimits = (model: string) => {
    const modelConfig = modelsConfig[model];
    if (!modelConfig) {
        return {
            maxInputTokens: 8192,
            maxOutputTokens: 4096,
            maxTokens: 12288,
        };
    }
    return {
        max_tokens: modelConfig.max_tokens,
        max_input_tokens: modelConfig.max_input_tokens,
        max_output_tokens: modelConfig.max_output_tokens
    };
}

/**
 * Calculate the cost of a model based on the input and output tokens
 * @param model - The model to calculate the cost for
 * @param inputTokens - The number of input tokens
 * @param outputTokens - The number of output tokens
 * @returns The cost of the model
 */
const calculateModelCost = (model: string, inputTokens: number, outputTokens: number) => {
    const modelConfig = modelsConfig[model];
    if (!modelConfig) {
        return 0;
    }
    return (modelConfig.input_cost_per_token ?? 0) * inputTokens + (modelConfig.output_cost_per_token ?? 0) * outputTokens;
}


export {
    getModelLimits,
    calculateModelCost
}