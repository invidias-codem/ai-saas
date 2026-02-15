import { getDB, eq, schemas } from "@anycrawl/db";
import type {
    TemplateConfig,
    TemplateClientConfig,
    TemplateExecutionContext,
    TemplateExecutionResult,
    TemplateFilters,
    TemplateListResponse,
} from "@anycrawl/libs";
import { TemplateNotFoundError, TemplateExecutionError } from "../errors/index.js";
import { TemplateCache } from "../cache/index.js";
import { QuickJSSandbox } from "../sandbox/index.js";
import { TemplateCodeValidator } from "../validator/index.js";
import { DomainValidator, type DomainValidationResult } from "../validator/domainValidator.js";

/**
 * Template Client - Main class for template management and execution
 */
export class TemplateClient {
    private cache: TemplateCache;
    private sandbox: QuickJSSandbox;
    private validator: TemplateCodeValidator;
    private db: any;
    private dbReady: Promise<void>;

    constructor(config?: TemplateClientConfig) {
        // Resolve cache TTL from env (0 disables cache; >0 sets TTL in ms)
        const ttlFromEnvRaw = process.env.ANYCRAWL_TEMPLATE_CACHE_TTL_MS || process.env.TEMPLATE_CACHE_TTL_MS;
        let effectiveCacheConfig = config?.cacheConfig;
        if (ttlFromEnvRaw !== undefined) {
            const parsedTtl = parseInt(ttlFromEnvRaw, 10);
            if (!Number.isNaN(parsedTtl) && parsedTtl >= 0) {
                effectiveCacheConfig = { ...(effectiveCacheConfig || {}), ttl: parsedTtl } as any;
            }
        }

        this.cache = new TemplateCache(effectiveCacheConfig);
        this.sandbox = new QuickJSSandbox(config?.sandboxConfig);
        this.validator = new TemplateCodeValidator();
        this.dbReady = this.initializeDatabase();
    }

    private async initializeDatabase(): Promise<void> {
        this.db = await getDB();
    }

    /**
     * Get a template by ID
     */
    async getTemplate(templateId: string): Promise<TemplateConfig> {
        await this.dbReady;
        // 1. Check cache first
        let template = await this.cache.get(templateId);
        // 2. Get from database on cache miss (development and production)
        if (!template) {
            const result = await this.db
                .select()
                .from(schemas.templates)
                .where(eq(schemas.templates.templateId, templateId))
                .limit(1);

            if (!result || result.length === 0) {
                throw new TemplateNotFoundError(templateId);
            }
            template = this.mapDbToTemplate(result[0]);
            // 3. Cache the template
            await this.cache.set(templateId, template);
        }

        return template!;
    }

    /**
     * Get templates with filters
     */
    async getTemplates(filters?: TemplateFilters): Promise<TemplateListResponse> {
        await this.dbReady;
        let query = this.db.select().from(schemas.templates);

        // Apply filters
        if (filters?.status) {
            query = query.where(eq(schemas.templates.status, filters.status));
        }

        if (filters?.reviewStatus) {
            query = query.where(eq(schemas.templates.reviewStatus, filters.reviewStatus));
        }

        if (filters?.createdBy) {
            query = query.where(eq(schemas.templates.createdBy, filters.createdBy));
        }

        // Apply pagination
        if (filters?.limit) {
            query = query.limit(filters.limit);
        }

        if (filters?.offset) {
            query = query.offset(filters.offset);
        }

        const results = await query;
        const mappedTemplates = results.map((row: any) => this.mapDbToTemplate(row));

        return {
            templates: mappedTemplates,
            total: results.length,
            limit: filters?.limit || 50,
            offset: filters?.offset || 0,
        };
    }

    /**
     * Execute a template
     */
    async executeTemplate(
        templateId: string,
        context: TemplateExecutionContext
    ): Promise<TemplateExecutionResult> {
        await this.dbReady;
        const startTime = Date.now();

        try {
            // 1. Get template
            const template = await this.getTemplate(templateId);

            // 2. Validate template code if it has custom handlers
            if (template.customHandlers?.requestHandler?.enabled) {
                await this.validator.validateCode(
                    template.customHandlers.requestHandler.code.source,
                    template
                );
            }

            // 4. Execute template
            let result;

            // If custom handler is enabled, execute it and return only template enhancements
            if (template.customHandlers?.requestHandler?.enabled) {
                // Execute custom handler with scrape result context
                const sandboxContext = {
                    template,
                    executionContext: { ...context, scrapeResult: context.scrapeResult || {} },
                    variables: context.variables || {},
                    page: (context as any).page, // Pass page object for browser-based templates
                };

                const customResult = await this.sandbox.executeCode(
                    template.customHandlers.requestHandler.code.source,
                    sandboxContext
                );

                // Return only the custom handler result (template enhancements)
                result = customResult || {};
            } else {
                // If no custom handler, return basic template info
                result = {
                    templateId: template.templateId,
                    templateName: template.name,
                    processedBy: 'template_system',
                    processingTime: new Date().toISOString(),
                };
            }

            const executionTime = Date.now() - startTime;

            // 5. Record execution
            await this.recordExecution(template, context, executionTime, true);

            return {
                success: true,
                data: result,
                executionTime,
                creditsCharged: template.pricing.perCall,
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const template = await this.getTemplate(templateId).catch(() => null);

            // Record failed execution
            if (template) {
                await this.recordExecution(template, context, executionTime, false, error as Error);
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new TemplateExecutionError(
                `Template execution failed: ${errorMessage}`,
                error as Error
            );
        }
    }

    /**
     * Validate domain restrictions for a template and URL
     * @param template - The template configuration
     * @param url - The URL to validate
     * @returns DomainValidationResult
     */
    public validateDomainRestrictions(template: TemplateConfig, url: string): DomainValidationResult {
        if (!template.metadata?.allowedDomains) {
            return { isValid: true };
        }

        const domainRestriction = DomainValidator.parseDomainRestriction(template.metadata.allowedDomains);
        if (!domainRestriction) {
            return { isValid: true };
        }

        return DomainValidator.validateDomain(url, domainRestriction);
    }

    /**
     * Record template execution in database
     */
    private async recordExecution(
        template: TemplateConfig,
        context: TemplateExecutionContext,
        executionTime: number,
        success: boolean,
        error?: Error
    ): Promise<void> {
        try {
            await this.db.insert(schemas.templateExecutions).values({
                templateUuid: template.uuid,
                processingTimeMs: executionTime,
                creditsCharged: template.pricing.perCall,
                success,
                errorMessage: error?.message,
                createdAt: new Date(),
            });
        } catch (dbError) {
            // Log error but don't throw - execution recording shouldn't fail the main operation
            console.warn("Failed to record template execution:", dbError);
        }
    }

    /**
     * Map database row to TemplateConfig
     */
    private mapDbToTemplate(row: any): TemplateConfig {
        return {
            uuid: row.uuid,
            templateId: row.templateId,
            name: row.name,
            description: row.description,
            tags: Array.isArray(row.tags) ? row.tags : JSON.parse(row.tags || "[]"),
            version: row.version,
            pricing: typeof row.pricing === "object" ? row.pricing : JSON.parse(row.pricing),
            templateType: row.templateType || "scrape",
            reqOptions: typeof row.reqOptions === "object" ? row.reqOptions : JSON.parse(row.reqOptions),
            customHandlers: row.customHandlers ? (typeof row.customHandlers === "object" ? row.customHandlers : JSON.parse(row.customHandlers)) : undefined,
            metadata: typeof row.metadata === "object" ? row.metadata : JSON.parse(row.metadata),
            variables: row.variables ? (typeof row.variables === "object" ? row.variables : JSON.parse(row.variables)) : undefined,
            createdBy: row.createdBy,
            publishedBy: row.publishedBy,
            reviewedBy: row.reviewedBy,
            status: row.status,
            reviewStatus: row.reviewStatus,
            reviewNotes: row.reviewNotes,
            trusted: row.trusted || false,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt),
            publishedAt: row.publishedAt ? new Date(row.publishedAt) : undefined,
            reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : undefined,
            archivedAt: row.archivedAt ? new Date(row.archivedAt) : undefined,
        };
    }
}