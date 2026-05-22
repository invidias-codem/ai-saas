import { supabase } from '../supabaseClient';

/**
 * Cost estimates for different RAG operations (in USD)
 */
export const COST_ESTIMATES = {
    QODO_PR_REVIEW: 0.10,           // OpenAI embeddings per PR
    GENIE_PR_REVIEW: 0.05,          // Gemini embeddings per PR
    CODEBASE_INDEX_PER_FILE: 0.002, // Per file indexed
    CODEBASE_INDEX_PER_CHUNK: 0.0005, // Per AST chunk indexed
    KNOWLEDGE_SYNC: 0.01,           // Per sync operation
} as const;

/**
 * Monthly budget limit in USD
 */
const MONTHLY_BUDGET = 5.00;

/**
 * Threshold percentage to trigger warnings (80% = $4.00)
 */
const WARNING_THRESHOLD = 0.8;

export interface RagUsage {
    id: string;
    operationType: string;
    tokensUsed: number;
    costUsd: number;
    metadata?: Record<string, any>;
    createdAt: string;
}

export interface BudgetStatus {
    spent: number;
    remaining: number;
    limit: number;
    percentUsed: number;
    isApproachingLimit: boolean;
    canProceed: boolean;
}

/**
 * Rate limiter class for RAG operations
 */
export class RateLimiter {
    private monthlyBudget: number;
    private warningThreshold: number;

    constructor(budget: number = MONTHLY_BUDGET, threshold: number = WARNING_THRESHOLD) {
        this.monthlyBudget = budget;
        this.warningThreshold = threshold;
    }

    /**
     * Check if we have budget for an operation
     */
    async checkBudget(estimatedCost: number): Promise<boolean> {
        const status = await this.getCurrentUsage();
        return status.remaining >= estimatedCost;
    }

    /**
     * Record usage for an operation
     */
    async recordUsage(
        operationType: string,
        costUsd: number,
        tokensUsed: number = 0,
        metadata: Record<string, any> = {}
    ): Promise<void> {
        try {
            const { error } = await supabase
                .from('rag_usage')
                .insert({
                    operation_type: operationType,
                    tokens_used: tokensUsed,
                    cost_usd: costUsd,
                    metadata
                });

            if (error) {
                console.error('Failed to record RAG usage:', error);
                throw error;
            }

            console.log(`📊 Recorded RAG usage: ${operationType} - $${costUsd.toFixed(4)}`);
        } catch (error) {
            console.error('Error recording RAG usage:', error);
            // Don't throw - we don't want to break the operation if logging fails
        }
    }

    /**
     * Get current month's usage statistics
     */
    async getCurrentUsage(): Promise<BudgetStatus> {
        try {
            // Call the Supabase function to get monthly cost
            const { data, error } = await supabase.rpc('get_monthly_rag_cost');

            if (error) {
                console.error('Failed to get monthly RAG cost:', error);
                throw error;
            }

            const spent = parseFloat(data || '0');
            const remaining = this.monthlyBudget - spent;
            const percentUsed = (spent / this.monthlyBudget) * 100;
            const isApproachingLimit = spent >= (this.monthlyBudget * this.warningThreshold);

            return {
                spent,
                remaining,
                limit: this.monthlyBudget,
                percentUsed,
                isApproachingLimit,
                canProceed: remaining > 0
            };
        } catch (error) {
            console.error('Error getting current RAG usage:', error);
            // Return safe defaults if we can't check
            return {
                spent: 0,
                remaining: this.monthlyBudget,
                limit: this.monthlyBudget,
                percentUsed: 0,
                isApproachingLimit: false,
                canProceed: true
            };
        }
    }

    /**
     * Check if we should pause indexing operations
     */
    async shouldPauseIndexing(): Promise<boolean> {
        const status = await this.getCurrentUsage();
        // Pause if we've used 90% of budget
        return status.percentUsed >= 90;
    }

    /**
     * Get remaining budget
     */
    async getRemainingBudget(): Promise<number> {
        try {
            const { data, error } = await supabase.rpc('get_remaining_rag_budget');

            if (error) throw error;

            return parseFloat(data || '0');
        } catch (error) {
            console.error('Error getting remaining budget:', error);
            return this.monthlyBudget;
        }
    }
}

/**
 * Priority queue for operations when approaching budget limit
 * Higher priority operations get executed first
 */
export interface Operation {
    type: string;
    priority: number;
    estimatedCost: number;
    execute: () => Promise<void>;
}

export async function prioritizeOperations(
    operations: Operation[]
): Promise<Operation[]> {
    const limiter = new RateLimiter();
    const status = await limiter.getCurrentUsage();

    // If we're not approaching limit, return all operations
    if (!status.isApproachingLimit) {
        return operations;
    }

    // Sort by priority (higher first)
    const sorted = [...operations].sort((a, b) => b.priority - a.priority);

    // Filter operations that fit within remaining budget
    const affordable: Operation[] = [];
    let remainingBudget = status.remaining;

    for (const op of sorted) {
        if (op.estimatedCost <= remainingBudget) {
            affordable.push(op);
            remainingBudget -= op.estimatedCost;
        }
    }

    console.log(`⚠️ Budget limit approaching. Prioritized ${affordable.length}/${operations.length} operations`);

    return affordable;
}

/**
 * Singleton instance for easy access
 */
export const rateLimiter = new RateLimiter();
