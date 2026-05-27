import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { EmbeddingTier } from '../types/documents';

// gemini-embedding-001 supports MRL (Matryoshka Representation Learning),
// allowing us to request exact output dimensions natively from the same model.
const EMBEDDING_MODEL = 'gemini-embedding-001';

// The DB column is VECTOR(3076). gemini-embedding-001 tops out at 3072 natively,
// so we request 3072 and pad 4 zeros to fill the column exactly.
const DIM_HIGH = 3076;
const DIM_STANDARD = 768;

/**
 * Dual-Rail embedding generation.
 * - STANDARD_768  → 768-dim vector  (fast retrieval, low cost)
 * - HIGH_RES_3076 → 3076-dim vector (semantic fidelity, drift detection)
 */
export async function embedDocumentChunk(text: string, tier: EmbeddingTier): Promise<number[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

  const isHighRes = tier === EmbeddingTier.HIGH_RES_3076;
  const requestedDim = isHighRes ? 3072 : DIM_STANDARD;
  const targetDim = isHighRes ? DIM_HIGH : DIM_STANDARD;

  try {
    const result = await model.embedContent({
      content: { parts: [{ text }], role: 'user' },
      taskType: TaskType.RETRIEVAL_DOCUMENT,
      // MRL: request exact output dims; spread only if non-default to keep payload clean
      ...(isHighRes && { outputDimensionality: requestedDim }),
    } as any);

    const values: number[] = result.embedding?.values ?? [];

    // Fast path: model returned exactly what we need
    if (values.length === targetDim) return values;

    // Pad (or truncate) to targetDim to match the DB VECTOR column exactly
    const out = new Array(targetDim).fill(0);
    for (let i = 0; i < Math.min(values.length, targetDim); i++) out[i] = values[i];
    return out;

  } catch (err: any) {
    console.error(`[Embedding] Failed to generate ${tier} embedding:`, err);
    throw new Error(`Embedding generation failed: ${err.message}`);
  }
}
