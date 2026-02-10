import type { TemplateConfig } from "@anycrawl/libs";

/**
 * Example Template: IANA Domain Information Scraper
 * Based on real AnyCrawl API call examples
 */
export const ianaDomainsTemplate: TemplateConfig = {
    uuid: "iana-domains-uuid-001",
    templateId: "iana-domains-scraper",
    name: "IANA Domain Information Scraper",
    description: "Specifically designed for scraping IANA domain help page navigation links and content summaries, with support for failed request redirection handling",
    tags: ["IANA", "domain", "navigation", "documentation"],
    version: "1.0.0",
    pricing: {
        perCall: 2,
        currency: "credits",
    },
    templateType: "scrape",
    reqOptions: {
        engine: "playwright",
        formats: ["markdown", "html", "screenshot", "json"],
        timeout: 30000,
        retry: true,
        wait_for: 1000,
        exclude_tags: ["h2"],
        json_options: {
            user_prompt: "summary",
            schema: {
                title: "string",
                summary: "string",
                navigationLinks: "array",
                lastRevised: "string",
            },
            schema_name: "IANADomainsData",
            schema_description: "Structured data for IANA domain pages",
        },
    },
    customHandlers: {
        requestHandler: {
            enabled: true,
            code: {
                language: "javascript",
                source: `
// IANA Domain Information Extractor
function extractIANAData() {
    try {
        // Extract page title
        const title = document.querySelector('title')?.textContent?.trim() || 
                     document.querySelector('h1')?.textContent?.trim() || 
                     'IANA Example Domains';
        
// TODO: Add custom page operation JavaScript code here
// You can use page.evaluate(), page.click(), page.waitForSelector() and other methods
// Example:
// await page.waitForSelector('.content');
// const data = await page.evaluate(() => {
//     return {
//         title: document.title,
//         content: document.body.textContent
//     };
// });
// return data;

console.log('Request handler - waiting for user to add JavaScript code');
return null;
        
        // Extract last revised date
        const lastRevisedElement = document.querySelector('[class*="revised"], [class*="updated"], .date');
        const lastRevised = lastRevisedElement?.textContent?.trim() || 
                           document.body.textContent?.match(/Last revised \\d{4}-\\d{2}-\\d{2}/)?.[0] ||
                           'Unknown';
        
        // Return structured data
        return {
            success: true,
            title: title,
            summary: summary || 'No summary available',
            navigationLinks: navigationLinks,
            lastRevised: lastRevised,
            totalLinks: navigationLinks.length,
            extractedAt: new Date().toISOString(),
            sourceUrl: window.location.href,
        };
        
    } catch (error) {
        console.error('Error occurred during extraction:', error);
        throw error;
    }
}

// Execute extraction and return result
return extractIANAData();
                `,
            },
        },
        failedRequestHandler: {
            enabled: true,
            code: {
                language: "javascript",
                source: `
function handleFailedRequest() {
    return {}
}

return handleFailedRequest();
                `,
            },
        },
    },
    metadata: {
        // Domain restrictions - supports glob and exact matching
        allowedDomains: {
            type: "glob",
            patterns: [
                "*.iana.org",
                "*.example.com",
                "*.example.org",
                "*.example.net",
                "localhost",
                "127.0.0.1"
            ]
        }
    },
    variables: {
        targetUrl: {
            type: "url",
            description: "IANA page URL to scrape",
            required: true,
            defaultValue: "https://www.iana.org/help/example-domains",
        },
        timeout: {
            type: "number",
            description: "Request timeout time (milliseconds)",
            required: false,
            defaultValue: 30000,
        },
        waitFor: {
            type: "number",
            description: "Page load wait time (milliseconds)",
            required: false,
            defaultValue: 1000,
        },
        enableScreenshot: {
            type: "boolean",
            description: "Whether to enable full page screenshot",
            required: false,
            defaultValue: true,
        },
        extractSummary: {
            type: "boolean",
            description: "Whether to extract page summary",
            required: false,
            defaultValue: true,
        },
    },
    createdBy: "template-creator-001",
    publishedBy: "admin-001",
    reviewedBy: "admin-001",
    status: "published",
    reviewStatus: "approved",
    reviewNotes: "Template created based on real AnyCrawl API examples",
    trusted: false,
    createdAt: new Date("2024-01-15T08:00:00Z"),
    updatedAt: new Date("2024-01-15T10:30:00Z"),
    publishedAt: new Date("2024-01-15T10:30:00Z"),
    reviewedAt: new Date("2024-01-15T10:30:00Z"),
};
