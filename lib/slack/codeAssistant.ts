/**
 * Code Assistant Module for Genie Slack Integration
 * 
 * Provides specialized code assistance:
 * - Code detection and language identification
 * - Code-optimized prompts
 * - Markdown to Slack formatting conversion
 * - Code explanation and debugging
 * - Language-specific handling
 */

// ─────────────────────────────────────────────────────────────────
// System Prompts
// ─────────────────────────────────────────────────────────────────

/**
 * Code-specific system prompt optimized for programming assistance
 * Based on Slack's Code Assistant tutorial
 */
export const CODE_SYSTEM_PROMPT = `You are 'Genie Code', an expert AI coding assistant integrated with Slack.
You specialize in answering questions about code, debugging, and software development.

Guidelines:
- Provide working, tested code examples with proper formatting
- Explain complex concepts step by step
- Suggest best practices and potential improvements
- Identify bugs, security issues, and edge cases when reviewing code
- Use appropriate language-specific conventions and idioms
- Keep explanations concise but thorough

Formatting Rules:
- Use Slack markdown: *bold*, _italic_, \`inline code\`
- Always put code blocks on their own line with proper spacing
- Use \`\`\` for multi-line code blocks (no language identifier needed for Slack)
- When a prompt has Slack's special syntax like <@USER_ID> or <#CHANNEL_ID>, keep them as-is
- Structure responses with clear sections when appropriate

Response Structure:
1. Brief explanation of the solution
2. Code example (if applicable)
3. Key points or gotchas to be aware of
4. Optional: suggestions for improvement`;

/**
 * "Friendly Professional" Persona Prompt for General Interaction
 * 
 * Traits:
 * - Helpful and direct
 * - Professional but warm
 * - Concise explanations
 * - Context-aware "Grok-like" capabilities
 */
export const KINDNESS_SYSTEM_PROMPT = `You are 'Genie', a helpful and intelligent AI assistant integrated with Slack.
Your personality is "Friendly Professional" - you are capable, direct, and supportive.

Key Personality Traits:
- **Professional & Warm**: Be polite and approachable, but avoid excessive enthusiasm or drama. Use emojis sparingly (1-2 per message max) to add a friendly touch.
- **Concise & Direct**: Value the user's time. Get to the point. Avoid long preambles or apologies unless necessary.
- **Collaborative**: Work *with* the user to solve problems.
- **Context Aware**: If provided with channel history, use it to understand the current topic and "vibe" before responding.

🛡️ HANDLING NEGATIVITY:
If a user is frustrated, rude, or negative:
1.  **Stay Calm**: Do not engage in an argument or become defensive.
2.  **Acknowledge & Pivot**: Briefly validate their frustration (e.g., "I understand this is frustrating") and immediately pivot to a solution.
3.  **No Lectures**: Do not scold the user. Focus entirely on fixing the issue.

Formatting:
- Use Slack markdown: *bold*, _italic_, \`code\`.
- Use lists and bullet points for readability.
- Keep responses visually clean.`;

/**
 * Debugging-specific prompt enhancement
 */
export const DEBUG_PROMPT_PREFIX = `You are debugging code. Focus on:
1. Identifying the root cause of the issue
2. Explaining why the bug occurs
3. Providing a corrected version of the code
4. Suggesting how to prevent similar issues

`;

/**
 * Code review prompt enhancement
 */
export const REVIEW_PROMPT_PREFIX = `You are reviewing code. Focus on:
1. Code quality and readability
2. Potential bugs or edge cases
3. Performance considerations
4. Security vulnerabilities
5. Best practices and improvements

`;

// ─────────────────────────────────────────────────────────────────
// Language Detection
// ─────────────────────────────────────────────────────────────────

/**
 * Language detection patterns
 */
export const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  javascript: [
    /\bconst\s+\w+\s*=/,
    /\blet\s+\w+\s*=/,
    /\bfunction\s+\w+\s*\(/,
    /=>\s*[{(]/,
    /\.js\b/i,
    /\brequire\s*\(/,
    /\bmodule\.exports\b/,
    /\bconsole\.log\b/,
    /\bdocument\./,
    /\bwindow\./,
  ],
  typescript: [
    /\binterface\s+\w+/,
    /\btype\s+\w+\s*=/,
    /:\s*(string|number|boolean|any|void|never)\b/,
    /\bas\s+\w+/,
    /\.ts\b/i,
    /\.tsx\b/i,
    /\bReadonly</,
    /\bPartial</,
    /\bRecord</,
    /\bPick</,
  ],
  python: [
    /\bdef\s+\w+\s*\(/,
    /\bclass\s+\w+.*:/,
    /\bimport\s+\w+/,
    /\bfrom\s+\w+\s+import/,
    /\.py\b/i,
    /\bself\./,
    /\bprint\s*\(/,
    /\bif\s+__name__\s*==\s*['"]__main__['"]/,
    /\basync\s+def\b/,
    /\bawait\s+/,
  ],
  java: [
    /\bpublic\s+(static\s+)?class\b/,
    /\bprivate\s+\w+\s+\w+/,
    /\bprotected\s+/,
    /\bvoid\s+\w+\s*\(/,
    /\.java\b/i,
    /\bSystem\.out\.print/,
    /\bimport\s+java\./,
    /\bextends\s+\w+/,
    /\bimplements\s+\w+/,
  ],
  csharp: [
    /\bpublic\s+class\b/,
    /\bnamespace\s+\w+/,
    /\busing\s+System/,
    /\.cs\b/i,
    /\bConsole\.Write/,
    /\basync\s+Task/,
    /\bvar\s+\w+\s*=/,
    /\bstring\[\]/,
  ],
  go: [
    /\bfunc\s+\w+\s*\(/,
    /\bpackage\s+\w+/,
    /\bimport\s+\(/,
    /\.go\b/i,
    /\bfmt\.Print/,
    /\bgo\s+func/,
    /\bchan\s+\w+/,
    /\bdefer\s+/,
  ],
  rust: [
    /\bfn\s+\w+\s*\(/,
    /\blet\s+mut\s+/,
    /\bimpl\s+\w+/,
    /\.rs\b/i,
    /\bprintln!\s*\(/,
    /\bOption</,
    /\bResult</,
    /\b&str\b/,
    /\bVec</,
  ],
  ruby: [
    /\bdef\s+\w+/,
    /\bclass\s+\w+\s*</,
    /\brequire\s+['"]/,
    /\.rb\b/i,
    /\bputs\s+/,
    /\bend\b/,
    /\battr_accessor\b/,
    /\bdo\s*\|/,
  ],
  php: [
    /\<\?php/,
    /\bfunction\s+\w+\s*\(/,
    /\$\w+\s*=/,
    /\.php\b/i,
    /\becho\s+/,
    /\bclass\s+\w+\s*(extends|implements)?/,
    /\bpublic\s+function/,
    /\b->\w+/,
  ],
  sql: [
    /\bSELECT\s+/i,
    /\bFROM\s+\w+/i,
    /\bWHERE\s+/i,
    /\bINSERT\s+INTO/i,
    /\bUPDATE\s+\w+\s+SET/i,
    /\bDELETE\s+FROM/i,
    /\bCREATE\s+TABLE/i,
    /\bJOIN\s+\w+\s+ON/i,
    /\.sql\b/i,
  ],
  html: [
    /<html/i,
    /<div/i,
    /<span/i,
    /<body/i,
    /<head/i,
    /\.html?\b/i,
    /<script/i,
    /<style/i,
  ],
  css: [
    /\{[\s\S]*?:\s*[\s\S]*?;[\s\S]*?\}/,
    /\.[\w-]+\s*\{/,
    /#[\w-]+\s*\{/,
    /\.css\b/i,
    /@media\s+/,
    /@import\s+/,
    /display\s*:/,
    /margin\s*:/,
  ],
  shell: [
    /^#!/,
    /\becho\s+/,
    /\bexport\s+\w+=/,
    /\.sh\b/i,
    /\bsudo\s+/,
    /\bchmod\s+/,
    /\bgrep\s+/,
    /\bawk\s+/,
    /\|\s*\w+/,
  ],
  yaml: [
    /^\s*\w+:\s*$/m,
    /^\s*-\s+\w+/m,
    /\.ya?ml\b/i,
    /^\s*\w+:\s+\w+/m,
  ],
  json: [
    /^\s*\{[\s\S]*"[\w]+"\s*:/,
    /\.json\b/i,
    /^\s*\[[\s\S]*\{/,
  ],
  markdown: [
    /^#+\s+/m,
    /\[.*?\]\(.*?\)/,
    /^\s*[-*]\s+/m,
    /\.md\b/i,
    /```[\s\S]*?```/,
  ],
};

/**
 * Language display names
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  shell: 'Shell/Bash',
  yaml: 'YAML',
  json: 'JSON',
  markdown: 'Markdown',
};

/**
 * Detect programming language from text
 * Returns the most likely language or null if none detected
 */
export function detectLanguage(text: string): string | null {
  const languageScores: Record<string, number> = {};

  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    const matches = patterns.filter(p => p.test(text)).length;
    if (matches > 0) {
      languageScores[language] = matches;
    }
  }

  // Get the language with the highest score
  const entries = Object.entries(languageScores);
  if (entries.length === 0) {
    return null;
  }

  entries.sort((a, b) => b[1] - a[1]);

  // Only return if we have a reasonable confidence (at least 2 matches)
  if (entries[0][1] >= 2) {
    return entries[0][0];
  }

  // If only 1 match, still return but with lower confidence
  return entries[0][0];
}

/**
 * Get the display name for a language
 */
export function getLanguageDisplayName(language: string): string {
  return LANGUAGE_NAMES[language] || language;
}

// ─────────────────────────────────��───────────────────────────────
// Code Detection
// ─────────────────────────────────────────────────────────────────

/**
 * Code-related keywords and patterns
 */
const CODE_INDICATORS = [
  // Programming keywords
  /\b(function|class|const|let|var|def|import|export|return|if|else|for|while|switch|case|try|catch|throw|async|await)\b/i,

  // Code blocks
  /```[\s\S]*```/,

  // File extensions
  /\.(js|ts|jsx|tsx|py|java|cpp|c|h|go|rs|rb|php|swift|kt|scala|cs|vb|sql|html|css|scss|sass|less|json|xml|yaml|yml|md|sh|bash|zsh|ps1)\b/i,

  // Programming terms
  /\b(debug|error|bug|compile|runtime|syntax|api|endpoint|database|query|server|client|frontend|backend|framework|library|package|module|dependency|npm|pip|maven|gradle)\b/i,

  // Code-related questions
  /\b(how to|write|create|implement|fix|solve|optimize|refactor|convert|migrate|deploy)\b.*\b(code|function|class|method|script|program|app|application|website|api)\b/i,

  // Technical operations
  /\b(loop|iterate|parse|serialize|deserialize|encode|decode|encrypt|decrypt|hash|sort|filter|map|reduce|fetch|request|response)\b/i,

  // Data structures
  /\b(array|list|object|dictionary|map|set|queue|stack|tree|graph|linked list|hash table)\b/i,

  // Common programming symbols
  /[{}\[\]();].*[{}\[\]();]/,
  /=>/,
  /\$\w+/,
  /::\w+/,
  /\.\w+\(/,
];

/**
 * Detect if a message is code-related
 */
export function isCodeRelated(text: string): boolean {
  // Check for explicit code blocks first
  if (/```[\s\S]*```/.test(text)) {
    return true;
  }

  // Check for code indicators
  const matchCount = CODE_INDICATORS.filter(pattern => pattern.test(text)).length;

  // Consider it code-related if at least 2 indicators match
  return matchCount >= 2;
}

/**
 * Extract code blocks from text
 */
export function extractCodeBlocks(text: string): string[] {
  const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }

  return blocks;
}

/**
 * Check if text contains inline code
 */
export function hasInlineCode(text: string): boolean {
  return /`[^`]+`/.test(text);
}

// ─────────────────────────────────────────────────────────────────
// Code Intent Detection
// ───────���─────────────────────────────────────────────────────────

/**
 * Types of code assistance
 */
export type CodeIntent =
  | 'explanation'    // Explain code
  | 'generation'     // Generate new code
  | 'debugging'      // Fix bugs
  | 'review'         // Code review
  | 'optimization'   // Improve performance
  | 'conversion'     // Convert between languages
  | 'documentation'  // Generate docs
  | 'testing'        // Write tests
  | 'refactoring';   // Refactor code

/**
 * Intent detection patterns
 */
const INTENT_PATTERNS: Record<CodeIntent, RegExp[]> = {
  explanation: [
    /\bexplain\b/i,
    /\bwhat does\b/i,
    /\bhow does\b/i,
    /\bunderstand\b/i,
    /\bwhat is\b/i,
    /\bwhy does\b/i,
    /\bwhat happens\b/i,
    /\bbreak down\b/i,
  ],
  generation: [
    /\bwrite\b/i,
    /\bcreate\b/i,
    /\bgenerate\b/i,
    /\bmake\b/i,
    /\bbuild\b/i,
    /\bimplement\b/i,
    /\bcode\s+(a|an|the)\b/i,
    /\bneed\s+(a|an)\s+\w+\s+(function|class|script|program)\b/i,
  ],
  debugging: [
    /\bfix\b/i,
    /\bdebug\b/i,
    /\berror\b/i,
    /\bbug\b/i,
    /\bnot working\b/i,
    /\bbroken\b/i,
    /\bissue\b/i,
    /\bproblem\b/i,
    /\bfailing\b/i,
    /\bcrash/i,
    /\bexception\b/i,
  ],
  review: [
    /\breview\b/i,
    /\bcheck\b/i,
    /\bfeedback\b/i,
    /\blook at\b/i,
    /\bwhat do you think\b/i,
    /\bis this\s+(good|correct|right|ok)\b/i,
    /\bany\s+(issues|problems|suggestions)\b/i,
  ],
  optimization: [
    /\boptimize\b/i,
    /\bfaster\b/i,
    /\bperformance\b/i,
    /\befficient\b/i,
    /\bimprove\b/i,
    /\bspeed up\b/i,
    /\breduce\s+(time|memory|complexity)\b/i,
    /\bbig\s*o\b/i,
  ],
  conversion: [
    /\bconvert\b/i,
    /\btranslate\b/i,
    /\bport\b/i,
    /\bmigrate\b/i,
    /\bfrom\s+\w+\s+to\s+\w+/i,
    /\bin\s+(javascript|python|java|typescript|go|rust)\b/i,
    /\brewrite\s+in\b/i,
  ],
  documentation: [
    /\bdocument\b/i,
    /\bcomment\b/i,
    /\breadme\b/i,
    /\bjsdoc\b/i,
    /\bdocstring\b/i,
    /\badd\s+comments\b/i,
    /\bexplain\s+the\s+code\b/i,
  ],
  testing: [
    /\btest\b/i,
    /\bunit test\b/i,
    /\btest case\b/i,
    /\bjest\b/i,
    /\bpytest\b/i,
    /\bmocha\b/i,
    /\bspec\b/i,
    /\bassert\b/i,
  ],
  refactoring: [
    /\brefactor\b/i,
    /\bclean\s*up\b/i,
    /\brestructure\b/i,
    /\breorganize\b/i,
    /\bsimplify\b/i,
    /\bmodularize\b/i,
    /\bextract\b/i,
    /\bsplit\b/i,
  ],
};

/**
 * Detect the intent of a code-related message
 */
export function detectCodeIntent(text: string): CodeIntent {
  const intentScores: Record<CodeIntent, number> = {
    explanation: 0,
    generation: 0,
    debugging: 0,
    review: 0,
    optimization: 0,
    conversion: 0,
    documentation: 0,
    testing: 0,
    refactoring: 0,
  };

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    intentScores[intent as CodeIntent] = patterns.filter(p => p.test(text)).length;
  }

  // Find the intent with the highest score
  const entries = Object.entries(intentScores) as [CodeIntent, number][];
  entries.sort((a, b) => b[1] - a[1]);

  // Return the top intent, or 'generation' as default
  return entries[0][1] > 0 ? entries[0][0] : 'generation';
}

/**
 * Get emoji for code intent
 */
export function getIntentEmoji(intent: CodeIntent): string {
  const emojis: Record<CodeIntent, string> = {
    explanation: '📚',
    generation: '💻',
    debugging: '🐛',
    review: '🔍',
    optimization: '⚡',
    conversion: '🔄',
    documentation: '📝',
    testing: '🧪',
    refactoring: '🔧',
  };
  return emojis[intent];
}

/**
 * Get label for code intent
 */
export function getIntentLabel(intent: CodeIntent): string {
  const labels: Record<CodeIntent, string> = {
    explanation: 'Explanation',
    generation: 'Code',
    debugging: 'Debug',
    review: 'Review',
    optimization: 'Optimization',
    conversion: 'Conversion',
    documentation: 'Documentation',
    testing: 'Test',
    refactoring: 'Refactor',
  };
  return labels[intent];
}

// ─────────────────────────────────────────────────────────────────
// Markdown to Slack Conversion
// ─────────────────────────────────────────────────────────────────

/**
 * Convert markdown to Slack-compatible format
 * Based on Slack's Code Assistant tutorial
 */
export function convertMarkdownToSlack(markdown: string): string {
  let text = markdown;

  // Handle code blocks first - add proper spacing
  text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
    code = code.trim();
    return "\n\n```\n" + code + "\n```\n\n";
  });

  // Fix triple+ newlines to double
  text = text.replace(/\n{3,}/g, "\n\n");

  // Convert bold: **text** or __text__ to *text*
  text = text.replace(/\*\*([^*]+)\*\*/g, "*$1*");
  text = text.replace(/__([^_]+)__/g, "*$1*");

  // Convert italic: *text* or _text_ to _text_ (but not inside bold)
  // This is tricky because Slack uses * for bold and _ for italic
  // We need to be careful not to convert already-converted bold markers

  // Convert links: [text](url) to <url|text>
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");

  // Convert strikethrough: ~~text~~ to ~text~
  text = text.replace(/~~([^~]+)~~/g, "~$1~");

  // Convert headers to bold (Slack doesn't have headers)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // Convert bullet points (already compatible, but ensure spacing)
  text = text.replace(/^\s*[-*]\s+/gm, "• ");

  // Convert numbered lists
  text = text.replace(/^\s*\d+\.\s+/gm, (match) => match);

  // Clean up any remaining issues
  text = text.trim();

  return text;
}

/**
 * Format code block for Slack
 */
export function formatCodeBlock(code: string, language?: string): string {
  const trimmedCode = code.trim();
  return `\n\n\`\`\`\n${trimmedCode}\n\`\`\`\n\n`;
}

/**
 * Format inline code for Slack
 */
export function formatInlineCode(code: string): string {
  return `\`${code}\``;
}

// ────────────────────────────────────────────────────────────��────
// Prompt Building
// ─────────────────────────────────────────────────────────────────

/**
 * Build a code-optimized prompt
 */
export function buildCodePrompt(
  userMessage: string,
  options?: {
    detectedLanguage?: string | null;
    intent?: CodeIntent;
    previousCode?: string;
    errorMessage?: string;
    targetLanguage?: string;
  }
): string {
  const parts: string[] = [];

  // Add intent-specific prefix
  if (options?.intent === 'debugging') {
    parts.push(DEBUG_PROMPT_PREFIX);
  } else if (options?.intent === 'review') {
    parts.push(REVIEW_PROMPT_PREFIX);
  }

  // Add language context
  if (options?.detectedLanguage) {
    parts.push(`[Language: ${getLanguageDisplayName(options.detectedLanguage)}]`);
  }

  // Add conversion target
  if (options?.intent === 'conversion' && options?.targetLanguage) {
    parts.push(`[Target Language: ${getLanguageDisplayName(options.targetLanguage)}]`);
  }

  // Add the user's message
  parts.push(userMessage);

  // Add error context if debugging
  if (options?.errorMessage) {
    parts.push(`\nError message:\n\`\`\`\n${options.errorMessage}\n\`\`\``);
  }

  // Add previous code context
  if (options?.previousCode) {
    parts.push(`\nExisting code:\n\`\`\`\n${options.previousCode}\n\`\`\``);
  }

  return parts.join('\n\n');
}

/**
 * Parse target language from conversion request
 */
export function parseTargetLanguage(text: string): string | null {
  // Match patterns like "convert to python", "in javascript", "to typescript"
  const patterns = [
    /\bto\s+(javascript|typescript|python|java|go|rust|ruby|php|csharp|c#)\b/i,
    /\bin\s+(javascript|typescript|python|java|go|rust|ruby|php|csharp|c#)\b/i,
    /\b(javascript|typescript|python|java|go|rust|ruby|php|csharp|c#)\s+version\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const lang = match[1].toLowerCase();
      // Normalize c# to csharp
      return lang === 'c#' ? 'csharp' : lang;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────
// Code-Specific Suggested Prompts
// ─────────────────────────────────────────────────────────────────

import { SuggestedPrompt } from './assistantHelpers';

/**
 * Code-specific suggested prompts
 */
export const CODE_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    title: '💻 Write code',
    message: 'Write a function that [describe what you need]',
  },
  {
    title: '🐛 Debug code',
    message: 'Help me debug this code: [paste your code and describe the issue]',
  },
  {
    title: '📚 Explain code',
    message: 'Explain what this code does: [paste code]',
  },
  {
    title: '⚡ Optimize code',
    message: 'How can I make this code more efficient? [paste code]',
  },
];

/**
 * Extended code prompts for the code command
 */
export const EXTENDED_CODE_PROMPTS: SuggestedPrompt[] = [
  ...CODE_SUGGESTED_PROMPTS,
  {
    title: '🔄 Convert code',
    message: 'Convert this code to [target language]: [paste code]',
  },
  {
    title: '🧪 Write tests',
    message: 'Write unit tests for this function: [paste code]',
  },
  {
    title: '📝 Add documentation',
    message: 'Add documentation/comments to this code: [paste code]',
  },
  {
    title: '🔧 Refactor code',
    message: 'Refactor this code to be cleaner: [paste code]',
  },
];

/**
 * Get code-aware prompts based on context
 */
export function getCodeAwarePrompts(isCodeContext: boolean): SuggestedPrompt[] {
  if (isCodeContext) {
    return CODE_SUGGESTED_PROMPTS;
  }

  // Return first 2 code prompts for general context
  return CODE_SUGGESTED_PROMPTS.slice(0, 2);
}

// ─────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────

/**
 * Truncate code for display (e.g., in feedback values)
 */
export function truncateCode(code: string, maxLength: number = 200): string {
  if (code.length <= maxLength) {
    return code;
  }
  return code.substring(0, maxLength - 3) + '...';
}

/**
 * Count lines of code
 */
export function countLines(code: string): number {
  return code.split('\n').length;
}

/**
 * Estimate code complexity (simple heuristic)
 */
export function estimateComplexity(code: string): 'simple' | 'moderate' | 'complex' {
  const lines = countLines(code);
  const hasLoops = /\b(for|while|do)\b/.test(code);
  const hasConditionals = /\b(if|else|switch|case)\b/.test(code);
  const hasFunctions = /\b(function|def|fn|func)\b/.test(code);
  const hasClasses = /\b(class|struct|interface)\b/.test(code);

  let score = 0;
  if (lines > 50) score += 2;
  else if (lines > 20) score += 1;
  if (hasLoops) score += 1;
  if (hasConditionals) score += 1;
  if (hasFunctions) score += 1;
  if (hasClasses) score += 2;

  if (score >= 5) return 'complex';
  if (score >= 2) return 'moderate';
  return 'simple';
}

/**
 * Check if code appears to have syntax errors (basic check)
 */
export function hasObviousSyntaxIssues(code: string): boolean {
  // Check for unbalanced brackets
  const brackets: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack: string[] = [];

  for (const char of code) {
    if (brackets[char]) {
      stack.push(brackets[char]);
    } else if (Object.values(brackets).includes(char)) {
      if (stack.pop() !== char) {
        return true;
      }
    }
  }

  return stack.length > 0;
}
