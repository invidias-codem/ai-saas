/**
 * Auto-Implementation Service
 * Applies safe suggestions from PR reviews automatically.
 */

import fs from 'fs';
import path from 'path';
import {
    Suggestion,
    ClassifiedSuggestions,
    AppliedChange,
    classifySuggestions,
    runSafetyChecks,
    generateClassificationSummary
} from './verificationLayer';

export interface AutoImplementResult {
    applied: AppliedChange[];
    skipped: Suggestion[];
    errors: string[];
    summary: string;
}

/**
 * Applies safe suggestions to the codebase.
 */
export async function autoImplementSafeSuggestions(
    suggestions: Suggestion[],
    basePath: string,
    dryRun: boolean = false
): Promise<AutoImplementResult> {
    const result: AutoImplementResult = {
        applied: [],
        skipped: [],
        errors: [],
        summary: ''
    };

    // 1. Classify suggestions
    const classified = classifySuggestions(suggestions);

    // 2. Skip non-safe suggestions
    result.skipped = [...classified.requiresApproval, ...classified.dangerous];

    // 3. Apply safe suggestions
    for (const suggestion of classified.safe) {
        try {
            if (dryRun) {
                console.log(`[DRY RUN] Would apply: ${suggestion.file}`);
                result.applied.push({
                    file: suggestion.file,
                    originalCode: suggestion.originalCode,
                    newCode: suggestion.suggestedCode,
                    suggestion
                });
                continue;
            }

            const filePath = path.join(basePath, suggestion.file);

            if (!fs.existsSync(filePath)) {
                result.errors.push(`File not found: ${suggestion.file}`);
                continue;
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');

            // Simple replacement
            if (!fileContent.includes(suggestion.originalCode)) {
                result.errors.push(`Original code not found in ${suggestion.file}`);
                continue;
            }

            const newContent = fileContent.replace(
                suggestion.originalCode,
                suggestion.suggestedCode
            );

            // Create backup
            const backupPath = `${filePath}.bak`;
            fs.writeFileSync(backupPath, fileContent);

            // Write new content
            fs.writeFileSync(filePath, newContent);

            result.applied.push({
                file: suggestion.file,
                originalCode: suggestion.originalCode,
                newCode: suggestion.suggestedCode,
                suggestion
            });

            console.log(`✅ Applied: ${suggestion.file}`);
        } catch (error) {
            result.errors.push(`Failed to apply ${suggestion.file}: ${error}`);
        }
    }

    // 4. Run safety checks on applied changes
    if (result.applied.length > 0 && !dryRun) {
        const safetyResult = await runSafetyChecks(result.applied);
        if (!safetyResult.passed) {
            result.errors.push('Safety checks failed:', ...safetyResult.errors);
            // Could trigger rollback here
        }
    }

    // 5. Generate summary
    result.summary = generateAutoImplementSummary(result, classified);

    return result;
}

/**
 * Rollback applied changes using backup files.
 */
export async function rollbackAutoImplementation(
    changes: AppliedChange[],
    basePath: string
): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const change of changes) {
        const filePath = path.join(basePath, change.file);
        const backupPath = `${filePath}.bak`;

        try {
            if (fs.existsSync(backupPath)) {
                const backup = fs.readFileSync(backupPath, 'utf-8');
                fs.writeFileSync(filePath, backup);
                fs.unlinkSync(backupPath);
                console.log(`🔄 Rolled back: ${change.file}`);
            } else {
                errors.push(`No backup found for ${change.file}`);
            }
        } catch (error) {
            errors.push(`Failed to rollback ${change.file}: ${error}`);
        }
    }

    return {
        success: errors.length === 0,
        errors
    };
}

/**
 * Generate implementation summary.
 */
function generateAutoImplementSummary(
    result: AutoImplementResult,
    classified: ClassifiedSuggestions
): string {
    const lines: string[] = [];

    lines.push('## 🤖 Auto-Implementation Summary');
    lines.push('');

    if (result.applied.length > 0) {
        lines.push(`### ✅ Applied (${result.applied.length})`);
        for (const change of result.applied) {
            lines.push(`- \`${change.file}\``);
        }
        lines.push('');
    }

    if (result.skipped.length > 0) {
        lines.push(`### ⏭️ Skipped - Requires Review (${result.skipped.length})`);
        for (const s of result.skipped.slice(0, 5)) {
            lines.push(`- \`${s.file}\`: ${s.reason.substring(0, 40)}...`);
        }
        if (result.skipped.length > 5) {
            lines.push(`- ... and ${result.skipped.length - 5} more`);
        }
        lines.push('');
    }

    if (result.errors.length > 0) {
        lines.push(`### ❌ Errors (${result.errors.length})`);
        for (const error of result.errors) {
            lines.push(`- ${error}`);
        }
        lines.push('');
    }

    lines.push('---');
    lines.push(`> 💡 To rollback: \`git checkout -- <file>\` or use backup files (\`.bak\`)`);

    return lines.join('\n');
}
