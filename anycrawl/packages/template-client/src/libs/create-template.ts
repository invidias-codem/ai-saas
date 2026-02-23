#!/usr/bin/env node

import { getDB, templates } from "@anycrawl/db";
import { createTemplate, deleteTemplateIfExists } from "@anycrawl/db";
import type { TemplateConfig } from "@anycrawl/libs";
import { randomUUID } from "crypto";

/**
 * Create a template example and write it to the database
 */
async function createTemplateScript(): Promise<TemplateConfig> {
    console.log("🚀 Starting to create template...");

    try {
        // Initialize database connection
        const db = await getDB();
        console.log("✅ Database connection successful");

        // Create a template configuration
        const templateConfig: TemplateConfig = {
            uuid: randomUUID(),
            templateId: "test-default",
            name: "News Article Scraper",
            description: "Specialized in scraping news website articles, extracting titles, content, publish time and author information",
            tags: ["news", "article", "content extraction", "media"],
            version: "1.0.0",
            pricing: {
                perCall: 3,
                currency: "credits",
            },
            templateType: "scrape",
            reqOptions: {
                engine: "playwright",
                formats: ["markdown", "html", "screenshot@fullPage", "json"],
                timeout: 30000,
                retry: true,
                wait_for: 1000,
                include_tags: [],
                exclude_tags: ["h2"],
                json_options: {
                    user_prompt: "summary and extract title",
                    schema: {
                        type: "object",
                        properties: {
                            title: { type: "string", description: "Article title" },
                            summary: { type: "string", description: "Article summary" }
                        },
                        required: ["title", "summary"]
                    },
                    schema_name: "Web Summary",
                    schema_description: "Structured data for web",
                },
            },
            customHandlers: {
                requestHandler: {
                    enabled: true,
                    code: {
                        language: "javascript",
                        source: `
function processTemplate() {
    const customData = {
        processedBy: 'custom_handler',
        customField: 'template_enhanced',
        processingTime: new Date().toISOString()
    };
    return customData;
}
return processTemplate();
                        `,
                    },
                },
                failedRequestHandler: {
                    enabled: true,
                    code: {
                        language: "javascript",
                        source: `
function handleFailedRequest() {
    console.log('failed, executing failure handler...');
}

return handleFailedRequest();
                        `,
                    },
                },
            },
            metadata: {
                allowedDomains: {
                    type: "glob",
                    patterns: [
                        "*.example.com",
                        "www.iana.org/help/example-domains"
                    ]
                }
            },
            variables: {
                waitTime: {
                    type: "number",
                    label: "Wait Time",
                    description: "Page load wait time (milliseconds)",
                    required: false,
                    defaultValue: 2000,
                },
                includeImages: {
                    type: "boolean",
                    label: "Include Images",
                    description: "Whether to include article images",
                    required: false,
                    defaultValue: false,
                },
                maxContentLength: {
                    type: "number",
                    label: "Maximum Content Length",
                    description: "Maximum content length limit",
                    required: false,
                    defaultValue: 10000,
                },
            },
            createdBy: "system-admin",
            publishedBy: "system-admin",
            reviewedBy: "system-admin",
            status: "published",
            reviewStatus: "approved",
            reviewNotes: "System created news article scraping template",
            trusted: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            publishedAt: new Date(),
            reviewedAt: new Date(),
        };

        // Prepare data for database insertion
        const templateData = {
            uuid: templateConfig.uuid,
            templateId: templateConfig.templateId,
            name: templateConfig.name,
            description: templateConfig.description,
            tags: templateConfig.tags,
            version: templateConfig.version,
            pricing: templateConfig.pricing,
            templateType: templateConfig.templateType || "scrape",
            reqOptions: templateConfig.reqOptions,
            customHandlers: templateConfig.customHandlers,
            metadata: templateConfig.metadata,
            variables: templateConfig.variables,
            createdBy: templateConfig.createdBy,
            publishedBy: templateConfig.publishedBy,
            reviewedBy: templateConfig.reviewedBy,
            status: templateConfig.status,
            reviewStatus: templateConfig.reviewStatus,
            reviewNotes: templateConfig.reviewNotes,
        };

        // Delete template if exists
        await deleteTemplateIfExists(templateConfig.templateId);

        // Create new template
        const result = await createTemplate(templateData);

        console.log("✅ Template created successfully!");
        console.log(`📋 Template ID: ${templateConfig.templateId}`);
        console.log(`🆔 UUID: ${templateConfig.uuid}`);
        console.log(`📝 Name: ${templateConfig.name}`);
        console.log(`🏷️  Tags: ${templateConfig.tags.join(", ")}`);
        console.log(`💰 Price: ${templateConfig.pricing.perCall} ${templateConfig.pricing.currency}`);
        console.log(`🎯 Allowed Domains: ${templateConfig.metadata.allowedDomains?.patterns?.join(" | ")}...`);

        return templateConfig;

    } catch (error) {
        console.error("❌ Failed to create template:", error);
        throw error;
    }
}

export { createTemplateScript };