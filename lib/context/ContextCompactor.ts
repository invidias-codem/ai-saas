import { estimateTokenCount } from '@/lib/ragMemory';
import { ContextCompactionResult } from './types';

/**
 * Utility class for structurally compacting large blocks of context (files, crawl results, history)
 * to keep them within prompt token budgets while preserving cognitive state.
 */
export class ContextCompactor {
  /**
   * Compact text using the specified mode to fit within a given token limit.
   */
  static compact(
    text: string,
    tokenLimit: number,
    options: {
      mode?: 'truncate' | 'outline' | 'summary' | 'auto';
      language?: string;
    } = {}
  ): ContextCompactionResult {
    const originalTokens = estimateTokenCount(text);
    if (originalTokens <= tokenLimit) {
      return {
        originalText: text,
        compactedText: text,
        originalTokens,
        compactedTokens: originalTokens,
        method: 'none',
        wasCompacted: false,
      };
    }

    const mode = options.mode ?? 'auto';
    const limitChars = tokenLimit * 4; // Approx 4 chars per token

    let compactedText = text;
    let method: 'truncate' | 'outline' | 'summary' = 'truncate';

    if (mode === 'outline' || (mode === 'auto' && this.isCode(text, options.language))) {
      compactedText = this.compactToCodeOutline(text, limitChars);
      method = 'outline';
    } else if (mode === 'summary') {
      compactedText = this.compactToSummaryOutline(text, limitChars);
      method = 'summary';
    } else {
      compactedText = this.middleTruncate(text, limitChars);
      method = 'truncate';
    }

    const compactedTokens = estimateTokenCount(compactedText);

    // If still over budget, fall back to aggressive truncation
    if (compactedTokens > tokenLimit && method !== 'truncate') {
      const fallbackText = this.middleTruncate(compactedText, limitChars);
      return {
        originalText: text,
        compactedText: fallbackText,
        originalTokens,
        compactedTokens: estimateTokenCount(fallbackText),
        method: 'truncate',
        wasCompacted: true,
      };
    }

    return {
      originalText: text,
      compactedText,
      originalTokens,
      compactedTokens,
      method,
      wasCompacted: true,
    };
  }

  /**
   * Determine if the given text represents source code.
   */
  private static isCode(text: string, language?: string): boolean {
    if (language) return ['typescript', 'javascript', 'ts', 'js', 'py', 'python', 'go', 'rust', 'cpp', 'html', 'css'].includes(language.toLowerCase());
    
    // Heuristic checks
    const codeIndicators = [
      /import\s+.*\s+from\s+['"].*['"]/,
      /const\s+.*\s+=\s+\(.*\)\s+=>/,
      /export\s+(class|interface|function|const|let|default)/,
      /function\s+\w+\s*\(.*\)/,
      /def\s+\w+\s*\(.*\):/,
      /package\s+\w+/,
      /using\s+System/,
      /public\s+class\s+\w+/
    ];

    return codeIndicators.some((regex) => regex.test(text));
  }

  /**
   * Compact source code by preserving imports, interface definitions, class outlines, and method signatures,
   * while omitting the implementation bodies.
   */
  private static compactToCodeOutline(code: string, limitChars: number): string {
    const lines = code.split('\n');
    const outlineLines: string[] = [];
    let insideImportBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Keep imports
      if (
        trimmed.startsWith('import ') ||
        trimmed.startsWith('import{') ||
        trimmed.startsWith('import *') ||
        trimmed.startsWith('import type')
      ) {
        outlineLines.push(line);
        if (trimmed.endsWith(';')) {
          insideImportBlock = false;
        } else {
          insideImportBlock = true;
        }
        continue;
      }

      if (insideImportBlock) {
        outlineLines.push(line);
        if (trimmed.endsWith(';')) {
          insideImportBlock = false;
        }
        continue;
      }

      // Keep class, interface, type, enum definitions and function signatures
      if (
        trimmed.startsWith('export class ') ||
        trimmed.startsWith('class ') ||
        trimmed.startsWith('export interface ') ||
        trimmed.startsWith('interface ') ||
        trimmed.startsWith('export type ') ||
        trimmed.startsWith('type ') ||
        trimmed.startsWith('export enum ') ||
        trimmed.startsWith('enum ') ||
        trimmed.startsWith('export function ') ||
        trimmed.startsWith('export const ') ||
        trimmed.startsWith('function ') ||
        trimmed.startsWith('async function ') ||
        (trimmed.startsWith('public ') && trimmed.includes('(')) ||
        (trimmed.startsWith('private ') && trimmed.includes('(')) ||
        (trimmed.startsWith('protected ') && trimmed.includes('('))
      ) {
        // Capture declaration signature
        if (trimmed.endsWith('{') || trimmed.endsWith('=>') || lines[i + 1]?.trim().startsWith('{')) {
          outlineLines.push(line + ' // [Implementation omitted for space]');
        } else {
          outlineLines.push(line);
        }
        continue;
      }

      // Keep comments that appear to be docstrings
      if (trimmed.startsWith('/**') || trimmed.startsWith('*') || trimmed.startsWith('*/')) {
        if (outlineLines.length > 0 && !outlineLines[outlineLines.length - 1].trim().startsWith('//')) {
          outlineLines.push(line);
        }
      }
    }

    const outlineResult = outlineLines.join('\n');
    if (outlineResult.length <= limitChars && outlineResult.length > 100) {
      return outlineResult;
    }

    // If still too long or outline extraction yielded too little, fallback to middle truncate
    return this.middleTruncate(code, limitChars);
  }

  /**
   * Compact text or document results into a structured outline containing headers and lead lines.
   */
  private static compactToSummaryOutline(text: string, limitChars: number): string {
    const lines = text.split('\n');
    const outlineLines: string[] = [];
    let currentLength = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      let lineToAdd = '';
      if (trimmed.startsWith('#')) {
        lineToAdd = line;
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.match(/^\d+\.\s+/)) {
        // Keep bullet lists but truncate list items if long
        if (trimmed.length > 120) {
          lineToAdd = trimmed.slice(0, 117) + '...';
        } else {
          lineToAdd = line;
        }
      } else if (trimmed.length > 0 && outlineLines.length < 50) {
        // Keep some context paragraphs if under threshold
        if (trimmed.length > 150) {
          lineToAdd = trimmed.slice(0, 147) + '...';
        } else {
          lineToAdd = line;
        }
      }

      if (lineToAdd) {
        if (currentLength + lineToAdd.length + 1 > limitChars) {
          if (trimmed.startsWith('#')) {
            outlineLines.push(lineToAdd);
            currentLength += lineToAdd.length + 1;
          } else {
            continue;
          }
        } else {
          outlineLines.push(lineToAdd);
          currentLength += lineToAdd.length + 1;
        }
      }
    }

    const summaryResult = outlineLines.join('\n');
    if (summaryResult.length <= limitChars && summaryResult.length > 50) {
      return summaryResult;
    }

    return this.middleTruncate(text, limitChars);
  }

  /**
   * Perform middle truncation keeping the beginning and end of the text.
   */
  private static middleTruncate(text: string, maxChars: number): string {
    if (!text || text.length <= maxChars) return text;

    const keepChars = Math.floor((maxChars - 150) / 2);
    if (keepChars <= 0) return text.slice(0, maxChars);

    const start = text.slice(0, keepChars);
    const end = text.slice(text.length - keepChars);
    const truncatedCount = text.length - maxChars;

    return `${start}\n\n... [TRUNCATED ${truncatedCount} CHARACTERS FOR CONTEXT WINDOW BUDGET] ...\n\n${end}`;
  }
}
