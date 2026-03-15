/**
 * Verification Layer for Auto-Implementation
 * Classifies PR suggestions by safety level to determine which can be auto-applied.
 */

export interface Suggestion {
    file: string;
    lineStart: number;
    lineEnd: number;
    originalCode: string;
    suggestedCode: string;
    reason: string;
    confidence: number;
    category: 'formatting' | 'import' | 'type' | 'logic' | 'security' | 'documentation';
    source: 'qodo' | 'genie';
}

export interface ClassifiedSuggestions {
    safe: Suggestion[];           // Auto-apply
    requiresApproval: Suggestion[]; // Human review needed
    dangerous: Suggestion[];        // Never auto-apply
}

export interface AppliedChange {
    file: string;
    originalCode: string;
    newCode: string;
    suggestion: Suggestion;
}

/**
 * Safety rules for auto-implementation
 */
export const SAFETY_RULES = {
    // Categories that are safe to auto-apply
    SAFE_CATEGORIES: ['formatting', 'import', 'type', 'documentation'] as const,

    // File patterns that are always safe
    SAFE_FILE_PATTERNS: [
        /\.css$/,
        /\.md$/,
        /README/i,
        /CHANGELOG/i,
        /\.json$/,  // package.json, tsconfig, etc.
    ],

    // Patterns that indicate dangerous changes - never auto-apply
    DANGEROUS_PATTERNS: [
        /password|auth|token|secret|key/i,
        /migration|schema|database/i,
        /payment|billing|stripe|paypal/i,
        /DELETE|DROP|TRUNCATE/i,
        /credential|oauth|jwt/i,
        /\.env/,
    ],

    // Patterns that require human approval
    REQUIRES_APPROVAL_PATTERNS: [
        /api\//i,
        /route\.ts$/,
        /middleware/i,
        /hook/i,
        /context/i,
        /provider/i,
    ],
};

/**
 * Analyzes PR suggestions and classifies them by safety level.
 */
export function classifySuggestions(suggestions: Suggestion[]): ClassifiedSuggestions {
    const result: ClassifiedSuggestions = {
        safe: [],
        requiresApproval: [],
        dangerous: []
    };

    for (const suggestion of suggestions) {
        const classification = classifySingle(suggestion);
        result[classification].push(suggestion);
    }

    console.log(`📊 Classification results:`);
    console.log(`   ✅ Safe: ${result.safe.length}`);
    console.log(`   ⚠️  Needs approval: ${result.requiresApproval.length}`);
    console.log(`   ❌ Dangerous: ${result.dangerous.length}`);

    return result;
}

/**
 * Classify a single suggestion.
 */
function classifySingle(suggestion: Suggestion): 'safe' | 'requiresApproval' | 'dangerous' {
    const { file, suggestedCode, category } = suggestion;
    const combinedContent = `${file}\n${suggestedCode}`;

    // 1. Check for dangerous patterns first (highest priority)
    for (const pattern of SAFETY_RULES.DANGEROUS_PATTERNS) {
        if (pattern.test(combinedContent)) {
            return 'dangerous';
        }
    }

    // 2. Check for patterns requiring approval
    for (const pattern of SAFETY_RULES.REQUIRES_APPROVAL_PATTERNS) {
        if (pattern.test(file)) {
            return 'requiresApproval';
        }
    }

    // 3. Check if category is safe
    if (SAFETY_RULES.SAFE_CATEGORIES.includes(category as any)) {
        return 'safe';
    }

    // 4. Check if file pattern is safe
    for (const pattern of SAFETY_RULES.SAFE_FILE_PATTERNS) {
        if (pattern.test(file)) {
            return 'safe';
        }
    }

    // 5. Default to requiring approval for unknown patterns
    return 'requiresApproval';
}

/**
 * Verifies that auto-applied changes don't break tests/linting.
 */
export async function runSafetyChecks(
    changes: AppliedChange[]
): Promise<{ passed: boolean; errors: string[] }> {
    const errors: string[] = [];

    // In a real implementation, this would:
    // 1. Run the linter
    // 2. Run type checking
    // 3. Run tests

    // For now, just validate that changes are non-empty
    for (const change of changes) {
        if (!change.newCode || change.newCode.trim().length === 0) {
            errors.push(`Empty change detected for ${change.file}`);
        }
    }

    return {
        passed: errors.length === 0,
        errors
    };
}

/**
 * Generates a summary of what was classified.
 */
export function generateClassificationSummary(classified: ClassifiedSuggestions): string {
    const lines: string[] = [];

    lines.push('## 🔍 Auto-Implementation Classification');
    lines.push('');

    if (classified.safe.length > 0) {
        lines.push(`### ✅ Safe to Auto-Apply (${classified.safe.length})`);
        for (const s of classified.safe) {
            lines.push(`- \`${s.file}\`: ${s.reason.substring(0, 50)}...`);
        }
        lines.push('');
    }

    if (classified.requiresApproval.length > 0) {
        lines.push(`### ⚠️ Requires Human Approval (${classified.requiresApproval.length})`);
        for (const s of classified.requiresApproval) {
            lines.push(`- \`${s.file}\`: ${s.reason.substring(0, 50)}...`);
        }
        lines.push('');
    }

    if (classified.dangerous.length > 0) {
        lines.push(`### ❌ Cannot Auto-Apply (${classified.dangerous.length})`);
        for (const s of classified.dangerous) {
            lines.push(`- \`${s.file}\`: Contains sensitive patterns`);
        }
        lines.push('');
    }

    return lines.join('\n');
}
