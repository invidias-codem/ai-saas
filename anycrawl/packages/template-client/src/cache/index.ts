import type { TemplateConfig, CachedTemplate } from "@anycrawl/libs";

export interface CacheConfig {
    ttl: number; // Time to live in milliseconds
    maxSize: number; // Maximum number of cached items
    cleanupInterval: number; // Cleanup interval in milliseconds
}

/**
 * Template Cache - In-memory cache for templates
 */
export class TemplateCache {
    private cache: Map<string, CachedTemplate> = new Map();
    private config: CacheConfig;
    private cleanupTimer?: NodeJS.Timeout;

    constructor(config?: Partial<CacheConfig>) {
        this.config = {
            ttl: config?.ttl !== undefined ? config.ttl : 300000, // 5 minutes default (0 disables cache)
            maxSize: config?.maxSize !== undefined ? config.maxSize : 100,
            cleanupInterval: config?.cleanupInterval !== undefined ? config.cleanupInterval : 60000, // 1 minute default
        };

        // Start cleanup timer
        if (this.config.ttl > 0) {
            this.startCleanupTimer();
        }
    }

    /**
     * Get template from cache
     */
    async get(templateId: string): Promise<TemplateConfig | null> {
        // When ttl <= 0, caching is disabled
        if (this.config.ttl <= 0) {
            return null;
        }
        const cached = this.cache.get(templateId);

        if (!cached) {
            return null;
        }

        // Check if expired
        if (Date.now() - cached.timestamp > this.config.ttl) {
            this.cache.delete(templateId);
            return null;
        }

        return cached.template;
    }

    /**
     * Set template in cache
     */
    async set(templateId: string, template: TemplateConfig): Promise<void> {
        // When ttl <= 0, do not store anything
        if (this.config.ttl <= 0) {
            return;
        }
        // Check if cache is full
        if (this.cache.size >= this.config.maxSize) {
            // Remove oldest entry
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }

        this.cache.set(templateId, {
            template,
            timestamp: Date.now(),
        });
    }

    /**
     * Invalidate template cache
     */
    async invalidate(templateId: string): Promise<void> {
        this.cache.delete(templateId);
    }

    /**
     * Clear all cache
     */
    async clear(): Promise<void> {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; maxSize: number; hitRate?: number } {
        return {
            size: this.cache.size,
            maxSize: this.config.maxSize,
        };
    }

    /**
     * Start cleanup timer
     */
    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpired();
        }, this.config.cleanupInterval);
    }

    /**
     * Clean up expired entries
     */
    private cleanupExpired(): void {
        const now = Date.now();
        for (const [key, cached] of this.cache.entries()) {
            if (now - cached.timestamp > this.config.ttl) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Destroy cache and cleanup resources
     */
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.cache.clear();
    }
}