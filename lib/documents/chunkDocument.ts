/**
 * Token-based chunking strategy.
 * Since true BPE tokenizers (like tiktoken) require native bindings or heavy WASM,
 * we use a word-boundary based approximation.
 * English averages ~1.3 tokens per word (or ~4 chars per token).
 * 
 * Target size: 512 tokens (~384 words)
 * Overlap: 10% (~51 tokens -> ~38 words)
 */

export interface DocumentChunkRecord {
  chunk_index: number;
  content: string;
}

interface ChunkOptions {
  maxTokens?: number;
  overlapPercentage?: number;
}

export function chunkDocumentText(text: string, options?: ChunkOptions): DocumentChunkRecord[] {
  const maxTokens = options?.maxTokens || 512;
  const overlapPercentage = options?.overlapPercentage || 0.10; // 10%

  // Approximate tokens to words (1 word ≈ 1.3 tokens)
  const targetWords = Math.floor(maxTokens / 1.3);
  const overlapWords = Math.floor(targetWords * overlapPercentage);

  // Simple whitespace splitting, preserving whitespace using regex
  // A more robust regex that splits by word boundaries while keeping delimiters
  const tokens = text.match(/[\w'-]+|[^\w\s]+|\s+/g) || [];

  const chunks: DocumentChunkRecord[] = [];
  let currentChunkIndex = 0;
  let i = 0;

  while (i < tokens.length) {
    // We count non-whitespace tokens roughly as "words" to approximate tokens
    let currentWordCount = 0;
    let currentChunkTokens: string[] = [];
    
    // Accumulate tokens until we hit the target
    let j = i;
    while (j < tokens.length && currentWordCount < targetWords) {
      const token = tokens[j];
      currentChunkTokens.push(token);
      if (token.trim().length > 0) {
         currentWordCount++;
      }
      j++;
    }

    // Join and trim the chunk
    const chunkContent = currentChunkTokens.join('').trim();
    
    // Only add non-empty chunks
    if (chunkContent.length > 0) {
      chunks.push({
        chunk_index: currentChunkIndex++,
        content: chunkContent
      });
    }

    // Advance index by target - overlap, but guarantee we advance at least by 1 to avoid infinite loop
    let tokensToAdvance = 0;
    let wordsAdvanced = 0;
    const advanceTargetWords = targetWords - overlapWords;

    while (i + tokensToAdvance < tokens.length && wordsAdvanced < advanceTargetWords) {
        if (tokens[i + tokensToAdvance].trim().length > 0) {
            wordsAdvanced++;
        }
        tokensToAdvance++;
    }

    if (tokensToAdvance === 0) {
        i++; // Failsafe
    } else {
        i += tokensToAdvance;
    }
  }

  return chunks;
}
