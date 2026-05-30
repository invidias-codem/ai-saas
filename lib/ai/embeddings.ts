import { getOpenAIClient } from './auth';

/**
 * Generates a vector embedding for the provided text using OpenAI's text-embedding-3-small model.
 * The output will always have a dimensionality of 1536.
 * 
 * @param text The text chunk to embed.
 * @param userId The ID of the user making the request.
 * @returns An array of numbers representing the vector embedding.
 */
export async function generateEmbedding(text: string, userId: string): Promise<number[]> {
    const openai = await getOpenAIClient(userId);

    // Strip newlines to improve embedding quality (standard RAG best practice)
    const sanitizedText = text.replace(/\n/g, ' ');
    
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: sanitizedText,
        dimensions: 1536,
    });
    
    return response.data[0].embedding;
}
