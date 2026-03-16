import type { TemplateConfig } from "@anycrawl/libs";
import { TemplateValidationError } from "../errors/index.js";
import { runInNewContext } from "vm";
import { DANGEROUS_PATTERNS } from "../constants/security.js";

/**
 * Template Code Validator - Validates template code for security and syntax
 */
export class TemplateCodeValidator {
    // Cache for successfully validated templates: Map<templateId, lastValidatedTimestamp>
    // Key format: templateId -> template's updatedAt timestamp
    // Only successful validations are cached; failures are never cached
    private validatedTemplates = new Map<string, number>();

    /**
     * Validate template code with caching
     * @returns true if validation passes
     * @throws TemplateValidationError if validation fails
     */
    async validateCode(code: string, template: TemplateConfig): Promise<boolean> {
        const templateId = template.templateId;

        // Get template's update timestamp
        const updatedAtRaw = template.updatedAt || template.createdAt || Date.now();
        const updatedAt = updatedAtRaw instanceof Date ? updatedAtRaw.getTime() : updatedAtRaw;

        const isDevelopment = process.env.NODE_ENV === 'development';

        // Check if this version is already validated (disabled in development)
        const cachedTimestamp = this.validatedTemplates.get(templateId);
        if (!isDevelopment && cachedTimestamp === updatedAt) {
            // This exact version passed validation before, skip re-validation
            return true;
        }

        // Run validations (throws on failure)
        this.validateSyntax(code, templateId);
        this.validateSecurity(code);
        this.validateComplexity(code);

        // All validations passed - cache this version (replaces old version)
        this.validatedTemplates.set(templateId, updatedAt);

        return true;
    }

    /**
     * Validate JavaScript syntax using VM context (no Script object creation)
     */
    private validateSyntax(code: string, templateId?: string): void {
        try {
            // Wrap code in async function (same as sandbox)
            const wrappedCode = `(async function() { ${code} })`;

            // Use runInNewContext for syntax validation
            // This compiles the code without executing it (empty sandbox)
            runInNewContext(wrappedCode, {}, {
                timeout: 100, // Very short timeout, just for compilation
                displayErrors: true
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new TemplateValidationError(
                `Invalid syntax${templateId ? ` in template ${templateId}` : ''}: ${errorMsg}`
            );
        }
    }

    /**
     * Validate code security using shared security patterns
     */
    private validateSecurity(code: string): void {
        for (const { pattern, message } of DANGEROUS_PATTERNS) {
            if (pattern.test(code)) {
                throw new TemplateValidationError(`Security violation: ${message}`);
            }
        }
    }

    /**
     * Validate code complexity
     */
    private validateComplexity(code: string): void {
        // Check nesting depth
        const maxNestingDepth = 20;
        let currentDepth = 0;
        let maxDepth = 0;

        for (const char of code) {
            if (char === "{" || char === "(" || char === "[") {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            } else if (char === "}" || char === ")" || char === "]") {
                currentDepth--;
            }
        }

        if (maxDepth > maxNestingDepth) {
            throw new TemplateValidationError(`Code nesting too deep (max ${maxNestingDepth} levels)`);
        }

        // Check loop count
        const loopPatterns = [
            /for\s*\(/g,
            /while\s*\(/g,
            /do\s*{/g,
        ];

        let totalLoops = 0;
        for (const pattern of loopPatterns) {
            const matches = code.match(pattern);
            if (matches) {
                totalLoops += matches.length;
            }
        }

        if (totalLoops > 10) {
            throw new TemplateValidationError("Too many loops (max 10)");
        }
    }
}