export interface ConfigModelProvider {
    provider: string;
    modelId: string;
}

export interface ConfigModelDetail {
    displayName: string;
    providers: ConfigModelProvider[];
}

export interface AIConfig {
    providers: {
        [key: string]: {
            enabled: boolean;
            apiKey: string;
            baseURL?: string;
        };
    };
    modelMapping: {
        [key: string]: ConfigModelDetail;
    };
    defaults: {
        DEFAULT_LLM_MODEL: string;
        DEFAULT_EXTRACT_MODEL?: string;
    };
}

export interface ModelConfig {
    displayName?: string;
    max_tokens?: number;
    max_input_tokens?: number;
    max_output_tokens?: number;
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    input_cost_per_token_batches?: number;
    output_cost_per_token_batches?: number;
    cache_read_input_token_cost?: number;
    cache_creation_input_token_cost?: number;
    input_cost_per_token_cache_hit?: number;
    input_cost_per_audio_token?: number;
    output_cost_per_audio_token?: number;
    cache_read_input_audio_token_cost?: number;
    cache_creation_input_audio_token_cost?: number;
    input_cost_per_image?: number;
    output_cost_per_image?: number;
    input_cost_per_video_per_second?: number;
    input_cost_per_audio_per_second?: number;
    input_cost_per_character?: number;
    input_cost_per_token_above_128k_tokens?: number;
    input_cost_per_character_above_128k_tokens?: number;
    input_cost_per_image_above_128k_tokens?: number;
    input_cost_per_video_per_second_above_128k_tokens?: number;
    input_cost_per_audio_per_second_above_128k_tokens?: number;
    output_cost_per_token_above_128k_tokens?: number;
    output_cost_per_character_above_128k_tokens?: number;
    output_cost_per_character?: number;
    input_cost_per_token_above_200k_tokens?: number;
    output_cost_per_token_above_200k_tokens?: number;
    input_cost_per_second?: number;
    input_cost_per_pixel?: number;
    supports_url_context?: boolean;
    supports_video_input?: boolean;
    output_cost_per_second?: number;
    output_cost_per_reasoning_token?: number;
    input_dbu_cost_per_token?: number;
    litellm_provider?: string;
    mode?: "chat" | "completion" | "embedding" | "image_generation" | "responses" | "moderation" | "audio_speech" | "audio_transcription" | "rerank";
    supports_function_calling?: boolean;
    supports_parallel_function_calling?: boolean;
    supports_response_schema?: boolean;
    supports_vision?: boolean;
    supports_prompt_caching?: boolean;
    supports_system_messages?: boolean;
    supports_tool_choice?: boolean;
    supports_pdf_input?: boolean;
    supports_audio_input?: boolean;
    supports_audio_output?: boolean;
    supports_assistant_prefill?: boolean;
    supports_native_streaming?: boolean;
    supports_reasoning?: boolean;
    supports_web_search?: boolean;
    supports_embedding_image_input?: boolean;
    supports_image_input?: boolean;
    supports_computer_use?: boolean;
    max_images_per_prompt?: number;
    max_videos_per_prompt?: number;
    max_video_length?: number;
    max_audio_length_hours?: number;
    max_audio_per_prompt?: number;
    max_pdf_size_mb?: number;
    max_document_chunks_per_query?: number;
    tpm?: number;
    rpm?: number;
    supported_modalities?: string[];
    supported_output_modalities?: string[];
    supported_endpoints?: string[];
    source?: string;
    deprecation_date?: string;
    output_vector_size?: number;
    tool_use_system_prompt_tokens?: number;
    search_context_cost_per_query?: {
        search_context_size_low: number;
        search_context_size_medium: number;
        search_context_size_high: number;
    };
    metadata?: {
        [key: string]: any;
    };
    [key: string]: any;
}

export type ModelsConfig = Record<string, ModelConfig>;
