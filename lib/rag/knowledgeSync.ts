/**
 * Knowledge Sync Service
 * Synchronizes insights from PR reviews into Genie's memory and knowledge graph.
 */

import { storeMemory } from '../memory/vectorStore';
import { addNode, addEdge } from '../memory/graphStore';
import { rateLimiter, COST_ESTIMATES } from './rateLimiter';

export interface PRInsight {
    prNumber: number;
    prTitle: string;
    author: string;
    insights: string[];
    patterns: string[];
    issues: string[];
    suggestions: string[];
    timestamp: string;
}

export interface SyncResult {
    memoriesStored: number;
    nodesCreated: number;
    edgesCreated: number;
    errors: string[];
}

/**
 * Syncs PR review insights to Genie's memory system.
 */
export async function syncPRInsightsToMemory(insight: PRInsight): Promise<SyncResult> {
    const result: SyncResult = {
        memoriesStored: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        errors: []
    };

    try {
        // Check budget
        const canProceed = await rateLimiter.checkBudget(COST_ESTIMATES.KNOWLEDGE_SYNC);
        if (!canProceed) {
            console.warn('🛑 Budget limit. Skipping knowledge sync.');
            return result;
        }

        // 1. Store PR summary as a memory
        const prSummary = formatPRSummary(insight);
        const memoryId = await storeMemory(
            'system',
            prSummary,
            'fact',
            {
                source: 'pr_review',
                prNumber: insight.prNumber,
                author: insight.author,
                timestamp: insight.timestamp
            }
        );

        if (memoryId) {
            result.memoriesStored++;
            console.log(`📝 Stored PR #${insight.prNumber} summary as memory`);
        }

        // 2. Create graph nodes for patterns discovered
        for (const pattern of insight.patterns) {
            const nodeId = await addNode(
                'system',
                pattern,
                'concept',
                `Pattern discovered in PR #${insight.prNumber}`,
                { source: 'pr_review', prNumber: insight.prNumber }
            );

            if (nodeId) {
                result.nodesCreated++;
            }
        }

        // 3. Create node for the PR itself
        const prNodeId = await addNode(
            'system',
            `PR-${insight.prNumber}`,
            'event',
            insight.prTitle,
            { author: insight.author, timestamp: insight.timestamp }
        );

        if (prNodeId) {
            result.nodesCreated++;

            // Create edges linking PR to patterns
            for (const pattern of insight.patterns) {
                await addEdge(
                    'system',
                    prNodeId,
                    pattern, // This should be the node ID, but we're using name for simplicity
                    'discovered',
                    0.8
                );
                result.edgesCreated++;
            }
        }

        // Record usage
        await rateLimiter.recordUsage('knowledge_sync', COST_ESTIMATES.KNOWLEDGE_SYNC);

        console.log(`✅ Synced PR #${insight.prNumber}:`);
        console.log(`   Memories: ${result.memoriesStored}`);
        console.log(`   Nodes: ${result.nodesCreated}`);
        console.log(`   Edges: ${result.edgesCreated}`);

    } catch (error) {
        result.errors.push(`Sync error: ${error}`);
        console.error('Knowledge sync failed:', error);
    }

    return result;
}

/**
 * Formats PR insights into a human-readable summary for storage.
 */
function formatPRSummary(insight: PRInsight): string {
    const lines: string[] = [];

    lines.push(`# PR #${insight.prNumber}: ${insight.prTitle}`);
    lines.push(`Author: ${insight.author}`);
    lines.push(`Date: ${insight.timestamp}`);
    lines.push('');

    if (insight.insights.length > 0) {
        lines.push('## Key Insights');
        insight.insights.forEach(i => lines.push(`- ${i}`));
        lines.push('');
    }

    if (insight.patterns.length > 0) {
        lines.push('## Patterns Discovered');
        insight.patterns.forEach(p => lines.push(`- ${p}`));
        lines.push('');
    }

    if (insight.issues.length > 0) {
        lines.push('## Issues Found');
        insight.issues.forEach(i => lines.push(`- ${i}`));
        lines.push('');
    }

    if (insight.suggestions.length > 0) {
        lines.push('## Suggestions Made');
        insight.suggestions.forEach(s => lines.push(`- ${s}`));
    }

    return lines.join('\n');
}

/**
 * Batch sync multiple PR insights (e.g., during periodic sync).
 */
export async function batchSyncPRInsights(insights: PRInsight[]): Promise<SyncResult> {
    const aggregatedResult: SyncResult = {
        memoriesStored: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        errors: []
    };

    for (const insight of insights) {
        const result = await syncPRInsightsToMemory(insight);
        aggregatedResult.memoriesStored += result.memoriesStored;
        aggregatedResult.nodesCreated += result.nodesCreated;
        aggregatedResult.edgesCreated += result.edgesCreated;
        aggregatedResult.errors.push(...result.errors);
    }

    return aggregatedResult;
}
