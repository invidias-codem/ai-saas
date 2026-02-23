// Text chunking functionality
export interface ChunkResult {
    chunk: string;
    startIndex: number;
    endIndex: number;
    tokens: number;
}

export interface ChunkOptions {
    maxTokens: number;
    overlapTokens: number;
}

export class TextChunker {
    private tokenCounter: (text: string) => number;

    constructor(tokenCounter: (text: string) => number) {
        this.tokenCounter = tokenCounter;
    }

    public splitTextIntoChunks(text: string, options: ChunkOptions): ChunkResult[] {
        const { maxTokens, overlapTokens } = options;
        const chunks: ChunkResult[] = [];
        const lines = text.split('\n');
        let currentChunk = '';
        let currentTokens = 0;
        let startIndex = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue; // Skip undefined lines

            const lineTokens = this.tokenCounter(line + '\n');

            // If adding this line would exceed max tokens, save current chunk
            if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
                chunks.push({
                    chunk: currentChunk.trim(),
                    startIndex,
                    endIndex: i - 1,
                    tokens: currentTokens
                });

                // Start new chunk with overlap
                const overlapLines = this.getOverlapLines(lines, i, overlapTokens);
                currentChunk = overlapLines.join('\n');
                currentTokens = this.tokenCounter(currentChunk);
                startIndex = Math.max(0, i - overlapLines.length + 1);
            }

            currentChunk += line + '\n';
            currentTokens += lineTokens;
        }

        // Add final chunk if there's content
        if (currentChunk.trim().length > 0) {
            chunks.push({
                chunk: currentChunk.trim(),
                startIndex,
                endIndex: lines.length - 1,
                tokens: currentTokens
            });
        }

        return chunks;
    }

    private getOverlapLines(lines: string[], currentIndex: number, overlapTokens: number): string[] {
        const overlapLines: string[] = [];
        let tokens = 0;

        for (let i = currentIndex - 1; i >= 0; i--) {
            const line = lines[i];
            if (!line) continue; // Skip undefined lines

            const lineTokens = this.tokenCounter(line);

            if (tokens + lineTokens > overlapTokens) {
                break;
            }

            overlapLines.unshift(line);
            tokens += lineTokens;
        }

        return overlapLines;
    }

    // Utility method to split multiple texts into chunks
    public splitMultipleTexts(texts: string[], options: ChunkOptions): ChunkResult[] {
        const allChunks: ChunkResult[] = [];

        for (const text of texts) {
            const chunks = this.splitTextIntoChunks(text, options);
            allChunks.push(...chunks);
        }

        return allChunks;
    }

    // Get chunk statistics
    public getChunkStats(chunks: ChunkResult[]): {
        totalChunks: number;
        totalTokens: number;
        averageTokensPerChunk: number;
        minTokens: number;
        maxTokens: number;
    } {
        if (chunks.length === 0) {
            return {
                totalChunks: 0,
                totalTokens: 0,
                averageTokensPerChunk: 0,
                minTokens: 0,
                maxTokens: 0
            };
        }

        const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
        const tokenCounts = chunks.map(chunk => chunk.tokens);

        return {
            totalChunks: chunks.length,
            totalTokens,
            averageTokensPerChunk: Math.round(totalTokens / chunks.length),
            minTokens: Math.min(...tokenCounts),
            maxTokens: Math.max(...tokenCounts)
        };
    }
} 