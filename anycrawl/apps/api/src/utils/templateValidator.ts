import { Response } from "express";
import { CrawlerErrorType } from "@anycrawl/scrape";

/**
 * Validates that when using template_id, only specific fields are allowed
 * @param requestData - The request body data
 * @param res - Express response object
 * @param templateType - The type of template (scrape, crawl, or search)
 * @returns true if validation passes, false if validation fails (response already sent)
 */
export function validateTemplateOnlyFields(
    requestData: Record<string, any>,
    res: Response,
    templateType: "scrape" | "crawl" | "search"
): boolean {
    if (!requestData.template_id) {
        return true; // No validation needed if not using template
    }

    // Define allowed fields based on template type
    const allowedFieldsMap: Record<typeof templateType, Set<string>> = {
        scrape: new Set(['template_id', 'url', 'variables']),
        crawl: new Set(['template_id', 'url', 'variables']),
        search: new Set(['template_id', 'query', 'variables'])
    };

    const allowedKeys = allowedFieldsMap[templateType];
    const providedKeys = Object.keys(requestData);
    const invalidKeys = providedKeys.filter(key => !allowedKeys.has(key));

    if (invalidKeys.length > 0) {
        const allowedFieldsList = Array.from(allowedKeys).join(', ');
        const message = `When using template_id, only ${allowedFieldsList} are allowed. Invalid fields: ${invalidKeys.join(', ')}`;

        res.status(400).json({
            success: false,
            error: "Validation error",
            message: message,
            data: {
                type: CrawlerErrorType.VALIDATION_ERROR,
                issues: invalidKeys.map(key => ({
                    field: key,
                    message: `Field '${key}' is not allowed when using template_id`,
                    code: 'invalid_field'
                })),
                message: `When using template_id, only ${allowedFieldsList} are allowed`,
                status: 'failed',
            },
        });
        return false;
    }

    return true;
}

