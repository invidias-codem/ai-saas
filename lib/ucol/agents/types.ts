/**
 * UCOL Error Resolution Agent — Types
 *
 * Autonomous pipeline: Vercel log error → classify → explore codebase →
 * generate fix → open PR for human review.
 */

export type ErrorCategory =
  | 'undefined_component'   // Element type is invalid / got: undefined
  | 'missing_dependency'    // Module not found / Cannot find module
  | 'type_error'            // TypeError at runtime
  | 'hydration_mismatch'    // Text content did not match
  | 'api_error'             // Unhandled API route exception
  | 'env_missing'           // Missing environment variable
  | 'import_error'          // Bad import path / ESM-CJS mismatch
  | 'unknown';              // Needs human review

export type ResolutionStatus =
  | 'pending'       // New, unprocessed
  | 'classifying'   // ErrorClassifier running
  | 'exploring'     // CodebaseExplorer searching
  | 'generating'    // FixGenerator running
  | 'pr_open'       // PR submitted, awaiting human
  | 'resolved'      // PR merged / issue closed
  | 'needs_human'   // Agent couldn't resolve — escalated
  | 'failed';       // Internal agent error

export interface ClassifiedError {
  /** Original Vercel log message */
  rawMessage: string;
  /** Vercel log timestamp */
  timestamp: string;
  /** Supabase row id */
  logId: string;

  category: ErrorCategory;
  /** Gemini's confidence 0–1 */
  confidence: number;
  /** Human-readable summary of what went wrong */
  summary: string;
  /** Files Gemini suspects as culprits (relative paths) */
  suspectedFiles: string[];
  /** Any stack frames extracted from the log */
  stackFrames: string[];
}

export interface CodebaseFile {
  path: string;
  content: string;
  sha: string; // needed for GitHub update_file
}

export interface GeneratedFix {
  /** Explanation of what was wrong and how it's fixed */
  explanation: string;
  /** Confidence 0–1 that this fix is correct */
  confidence: number;
  /** Map of file path → new full file content */
  fileChanges: Record<string, string>;
  /** Short branch name slug, e.g. "fix/undefined-component-codepanel" */
  branchSlug: string;
  /** PR title */
  prTitle: string;
  /** PR body (markdown) */
  prBody: string;
}

export interface ResolutionResult {
  logId: string;
  status: ResolutionStatus;
  category: ErrorCategory;
  prUrl?: string;
  prNumber?: number;
  error?: string; // if status === 'failed'
}
