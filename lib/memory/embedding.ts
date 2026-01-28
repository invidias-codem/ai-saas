
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

/**
 * Generates an embedding vector for the given text.
 * Uses 'embedding-001' model by default.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    try {
        if (!process.env.GOOGLE_API_KEY) {
            throw new Error('GOOGLE_API_KEY is not set');
        }

        // For retrieval tasks, we use the text-embedding-004 model
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

        const result = await model.embedContent(text);
        const embedding = result.embedding;

        return embedding.values;
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
    }
}
