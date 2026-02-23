// Extraction prompts for LLMExtract
export const EXTRACT_SYSTEM_PROMPT = `You are a data extraction assistant. You MUST strictly follow the provided JSON schema structure. 

CRITICAL RULES:
1. Only extract and return the exact fields defined in the schema
2. Do not add any extra fields, properties, or nested structures not specified in the schema
3. If a field is not found in the content, set it to null rather than creating new structures
4. Follow the exact property names, types, and structure as defined in the schema
5. Do not nest data under additional wrapper objects unless explicitly defined in the schema

Return only the JSON object that matches the schema exactly.`;

export const BASE_EXTRACTION_PROMPT =
    `Extract data from the following content and return it in the exact JSON structure defined by the schema. IMPORTANT: Only include fields that are defined in the schema. Do not create additional fields or nested structures.`;

export function buildExtractionPrompt({ prompt, fieldPrompt, content }: { prompt?: string, fieldPrompt?: string, content: string }) {
    if (prompt) {
        return `${BASE_EXTRACTION_PROMPT} User request: ${prompt}.${fieldPrompt || ''}\n\nContent:\n${content}`;
    }
    return `${BASE_EXTRACTION_PROMPT}${fieldPrompt || ''}\n\nContent:\n${content}`;
} 