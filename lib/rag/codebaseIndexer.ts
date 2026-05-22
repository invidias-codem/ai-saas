import fs from 'fs';
import path from 'path';
import { storeMemory, deleteCodeChunks, storeMemoriesBulk } from '../memory/vectorStore';
import { rateLimiter, COST_ESTIMATES } from './rateLimiter';
import { chunkFile } from './astChunker';

export interface IndexResult {
    indexedFiles: string[];
    skippedFiles: string[];
    totalCost: number;
}

export interface IndexOptions {
    basePath: string;
    excludePatterns: string[];
    includeExtensions: string[];
    dryRun?: boolean;
}

/**
 * Service to index codebase files into the Genie RAG system.
 */
export class CodebaseIndexer {
    private excludePatterns: string[];
    private includeExtensions: string[];

    constructor(options: Partial<IndexOptions> = {}) {
        this.excludePatterns = options.excludePatterns || [
            'node_modules/**',
            '.next/**',
            'dist/**',
            'build/**',
            '.git/**',
            '.venv/**',
            'venv/**',
            'env/**',
            '*.test.ts',
            '*.test.tsx',
            '__tests__/**'
        ];
        this.includeExtensions = options.includeExtensions || ['.ts', '.tsx', '.js', '.jsx', '.go', '.sql', '.md'];
    }

    /**
     * Main entry point to index the codebase.
     */
    async index(options: IndexOptions): Promise<IndexResult> {
        const { basePath, dryRun = false } = options;
        const result: IndexResult = {
            indexedFiles: [],
            skippedFiles: [],
            totalCost: 0
        };

        console.log(`🚀 Starting codebase indexing in: ${basePath}`);
        if (dryRun) console.log('🧪 DRY RUN enabled - no embeddings will be generated');

        const files = this.walkDir(basePath);

        for (const file of files) {
            if (this.shouldInclude(file, basePath)) {
                const relativePath = path.relative(basePath, file);
                try {
                    const content = fs.readFileSync(file, 'utf-8');
                    if (!content || content.trim().length === 0) {
                        result.skippedFiles.push(file);
                        continue;
                    }

                    const chunks = chunkFile(content, file);
                    if (chunks.length === 0) {
                        result.skippedFiles.push(file);
                        continue;
                    }

                    if (dryRun) {
                        console.log(`🧪 [Dry Run] Plan to index ${relativePath} as ${chunks.length} chunks:`);
                        chunks.slice(0, 5).forEach(c => {
                            console.log(`   - [${c.chunkType}] ${c.logicalName} (lines ${c.startLine}-${c.endLine})`);
                        });
                        if (chunks.length > 5) {
                            console.log(`   - ... and ${chunks.length - 5} more chunks`);
                        }
                        result.indexedFiles.push(file);
                        continue;
                    }

                    console.log(`📄 Indexing: ${relativePath} (${chunks.length} chunks)`);
                    const totalCost = chunks.length * COST_ESTIMATES.CODEBASE_INDEX_PER_CHUNK;
                    const canProceed = await rateLimiter.checkBudget(totalCost);

                    if (!canProceed) {
                        console.warn(`🛑 Budget limit reached. Skipping file indexing for ${relativePath}.`);
                        result.skippedFiles.push(file);
                        break;
                    }

                    // 1. Derive unique workspace credentials
                    const workspaceId = process.cwd();
                    const workspaceName = path.basename(workspaceId);

                    // 2. Perform stale chunk sweep atomically
                    await deleteCodeChunks(relativePath, workspaceId);

                    // 3. Prepare bulk insert payload
                    const memoriesToStore = chunks.map(chunk => ({
                        content: chunk.content,
                        type: 'code_chunk' as const,
                        metadata: {
                            path: relativePath,
                            logicalName: chunk.logicalName,
                            chunkType: chunk.chunkType,
                            startLine: chunk.startLine,
                            endLine: chunk.endLine,
                            dependencies: chunk.dependencies || [],
                            source: 'codebase_index',
                            indexedAt: new Date().toISOString(),
                            workspaceId,
                            workspaceName
                        }
                    }));

                    // 4. Store chunks in bulk batch
                    const memoryIds = await storeMemoriesBulk(
                        'system',
                        memoriesToStore,
                        { scope: 'workspace', workspaceId }
                    );

                    if (memoryIds && memoryIds.length === chunks.length) {
                        result.totalCost += totalCost;
                        await rateLimiter.recordUsage('codebase_indexing_chunk', totalCost);
                        result.indexedFiles.push(file);
                    } else {
                        console.error(`❌ Failed to bulk index file ${relativePath}`);
                        result.skippedFiles.push(file);
                    }
                } catch (error) {
                    console.error(`❌ Failed to index ${file}:`, error);
                    result.skippedFiles.push(file);
                }
            } else {
                result.skippedFiles.push(file);
            }
        }

        console.log(`\n✅ Indexing complete!`);
        console.log(`   Files indexed: ${result.indexedFiles.length}`);
        console.log(`   Files skipped: ${result.skippedFiles.length}`);
        console.log(`   Total cost: $${result.totalCost.toFixed(4)}`);

        return result;
    }

    /**
     * Recursively walk a directory.
     */
    private walkDir(dir: string, rootDir: string = dir): string[] {
        let results: string[] = [];
        const list = fs.readdirSync(dir);

        for (let file of list) {
            const fullPath = path.resolve(dir, file);
            const relativePath = path.relative(rootDir, fullPath);
            const stat = fs.statSync(fullPath);

            // Skip excluded directories BEFORE descending
            const excludedSegments = ['node_modules', '.next', 'dist', 'build', '.git', '.venv', 'venv', 'env', '__tests__'];
            if (stat && stat.isDirectory()) {
                if (excludedSegments.some(seg => relativePath === seg || relativePath.includes(path.sep + seg))) {
                    continue;
                }
                results = results.concat(this.walkDir(fullPath, rootDir));
            } else {
                results.push(fullPath);
            }
        }

        return results;
    }

    /**
     * Determine if a file should be included in indexing.
     */
    private shouldInclude(filePath: string, basePath: string): boolean {
        const relativePath = path.relative(basePath, filePath);
        const fileName = path.basename(filePath);
        const extension = path.extname(filePath);

        // 1. Check extensions
        if (!this.includeExtensions.includes(extension)) {
            return false;
        }

        // 2. Check hardcoded exclusions
        const excludedSegments = ['node_modules', '.next', 'dist', 'build', '.git', '__tests__'];
        if (excludedSegments.some(seg => relativePath.includes(seg))) {
            return false;
        }

        // 3. Check test files
        if (fileName.includes('.test.') || fileName.includes('.spec.')) {
            return false;
        }

        return true;
    }
}

export const codebaseIndexer = new CodebaseIndexer();
