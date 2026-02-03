import { searchMemories } from '../memory/vectorStore';
import { findRelatedEntities, formatGraphContext } from '../memory/graphStore';
import { rateLimiter, COST_ESTIMATES } from './rateLimiter';

export interface PRData {
    files: string[];
    diff: string;
    title: string;
    description: string;
}

export interface PRContext {
    relatedPatterns: Array<{
        content: string;
        similarity: number;
        metadata: any;
    }>;
    relatedEntities: Array<{
        name: string;
        type: string;
        relationships: string[];
    }>;
    summary: string;
    codebaseInsights: string[];
}

/**
 * Analyzes PR changes and retrieves relevant context from Genie's memory.
 */
export async function enrichPRContext(prData: PRData): Promise<PRContext> {
    const context: PRContext = {
        relatedPatterns: [],
        relatedEntities: [],
        summary: '',
        codebaseInsights: []
    };

    try {
        // Check budget first
        const canProceed = await rateLimiter.checkBudget(COST_ESTIMATES.GENIE_PR_REVIEW);
        if (!canProceed) {
            console.warn('🛑 Budget limit reached. Skipping PR context enrichment.');
            context.summary = 'Context enrichment skipped due to budget limits.';
            return context;
        }

        // 1. Search for related code patterns based on PR title and description
        const searchQuery = `${prData.title}\n${prData.description}\n${prData.files.join(' ')}`;
        const memories = await searchMemories('system', searchQuery, 5);

        context.relatedPatterns = memories.map(m => ({
            content: m.content.substring(0, 500), // Truncate for display
            similarity: m.similarity || 0,
            metadata: m.metadata
        }));

        // 2. Extract entity names from changed files
        const entityNames = extractEntityNamesFromFiles(prData.files);
        for (const name of entityNames.slice(0, 3)) { // Limit to 3 entities
            const graphData = await findRelatedEntities('system', name);
            if (graphData.centralNode) {
                context.relatedEntities.push({
                    name: graphData.centralNode.name,
                    type: graphData.centralNode.type,
                    relationships: graphData.relatedNodes.map(r =>
                        `${r.relation} → ${r.node?.name || 'unknown'}`
                    )
                });
            }
        }

        // 3. Generate insights
        context.codebaseInsights = generateInsights(context, prData);

        // 4. Create summary
        context.summary = generateSummary(context, prData);

        // Record usage
        await rateLimiter.recordUsage('genie_pr_review', COST_ESTIMATES.GENIE_PR_REVIEW);

        return context;
    } catch (error) {
        console.error('Error enriching PR context:', error);
        context.summary = `Error during context enrichment: ${error}`;
        return context;
    }
}

/**
 * Extract potential entity names from file paths.
 */
function extractEntityNamesFromFiles(files: string[]): string[] {
    const entities: Set<string> = new Set();

    for (const file of files) {
        // Extract component/module names from paths
        const parts = file.split('/');
        for (const part of parts) {
            // Skip common directory names
            if (['src', 'lib', 'app', 'components', 'pages', 'api'].includes(part)) continue;

            // Extract name from file
            const name = part.replace(/\.(ts|tsx|js|jsx|sql|md)$/, '');
            if (name && name.length > 2) {
                entities.add(name);
            }
        }
    }

    return Array.from(entities);
}

/**
 * Generate insights based on context.
 */
function generateInsights(context: PRContext, prData: PRData): string[] {
    const insights: string[] = [];

    // Check for similar patterns
    if (context.relatedPatterns.length > 0) {
        const highSimilarity = context.relatedPatterns.filter(p => p.similarity > 0.8);
        if (highSimilarity.length > 0) {
            insights.push(`🔍 Found ${highSimilarity.length} highly similar code pattern(s) in the codebase.`);
        }
    }

    // Check file count
    if (prData.files.length > 10) {
        insights.push(`📁 Large PR: ${prData.files.length} files changed. Consider splitting into smaller PRs.`);
    }

    // Check for related entities
    if (context.relatedEntities.length > 0) {
        insights.push(`🔗 This PR affects components related to: ${context.relatedEntities.map(e => e.name).join(', ')}`);
    }

    return insights;
}

/**
 * Generate a human-readable summary.
 */
function generateSummary(context: PRContext, prData: PRData): string {
    const parts: string[] = [];

    parts.push(`## Genie RAG Context for "${prData.title}"`);
    parts.push('');

    if (context.relatedPatterns.length > 0) {
        parts.push(`### 📚 Related Patterns (${context.relatedPatterns.length})`);
        context.relatedPatterns.forEach((p, i) => {
            const path = p.metadata?.path || 'unknown';
            parts.push(`${i + 1}. \`${path}\` (${(p.similarity * 100).toFixed(0)}% similar)`);
        });
        parts.push('');
    }

    if (context.relatedEntities.length > 0) {
        parts.push(`### 🔗 Related Entities (${context.relatedEntities.length})`);
        context.relatedEntities.forEach(e => {
            parts.push(`- **${e.name}** (${e.type})`);
            if (e.relationships.length > 0) {
                parts.push(`  - ${e.relationships.slice(0, 3).join(', ')}`);
            }
        });
        parts.push('');
    }

    if (context.codebaseInsights.length > 0) {
        parts.push('### 💡 Insights');
        context.codebaseInsights.forEach(i => parts.push(`- ${i}`));
    }

    return parts.join('\n');
}

export const prContextEnricher = { enrichPRContext };
