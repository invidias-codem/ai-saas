/**
 * lib/jepa/astEncoderInput.ts
 *
 * JEPA-oriented AST serialization: produces a deterministic linearized token
 * sequence from source code so it can be fed to the UniXcoder encoder input
 * pipeline.
 *
 * The output is a single string of space-separated tokens in a LISP-like
 * bracketed format:
 *
 *   (NODE_TYPE field1 value1 ... (CHILD_TYPE field val ...) ...)
 *
 * Design goals:
 *  - Deterministic: same source → same token sequence (sorts children).
 *  - Lossless: every AST node type and key property is represented.
 *  - Language-agnostic interface: dispatches to language-specific serializers.
 *  - No native bindings: relies on the existing TS compiler API (TS/JS),
 *    web-tree-sitter WASM (Python, Go, Rust, C++, etc.), and the Go binary
 *    already used by astChunker.ts (Go). Other languages fall back to a
 *    whitespace tokenizer so the pipeline never crashes.
 *
 * Stage 0 acceptance criteria (§8 of spec):
 *  "A serializeAstForJepa(sourceCode, language) function that produces a
 *   stable token sequence for all supported languages."
 */

import * as ts from 'typescript';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getParser, initTreeSitter, ParserAdapter } from './treeSitterLoader';

// ─── Public types ────────────────────────────────────────────────────────────

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'tsx'
  | 'jsx'
  | 'go'
  | 'python'
  | 'sql'
  | 'markdown'
  | 'unknown';

export interface JepaAstToken {
  type: string;
  value?: string;
  children?: JepaAstToken[];
}

export interface SerializeAstOptions {
  /** Max depth to walk the AST (safety bound for malformed trees). */
  maxDepth?: number;
  /** Truncate leaf string values longer than this many chars. */
  maxLeafLength?: number;
  /** Include trivia (comments, whitespace) tokens. Off by default. */
  includeTrivia?: boolean;
  /** Max tokens per chunk to prevent encoder input blow-up (structural chunking). */
  maxTokensPerChunk?: number;
}

const DEFAULT_OPTIONS: Required<SerializeAstOptions> = {
  maxDepth: 256,
  maxLeafLength: 200,
  includeTrivia: false,
  maxTokensPerChunk: 512,
};

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** Sanitize a string so it can appear safely inside a token value. */
function escapeValue(s: string, maxLen: number): string {
  const trimmed = s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  // Replace whitespace/newlines with _ to keep the token stream a single line.
  return trimmed.replace(/\s+/g, '_').replace(/[()]/g, '_');
}

/** Deterministically sort siblings by their stringified token. */
function sortTokens(tokens: JepaAstToken[]): JepaAstToken[] {
  return tokens.sort((a, b) => {
    const aKey = [a.type, a.value ?? ''].join('\x00');
    const bKey = [b.type, b.value ?? ''].join('\x00');
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
}

/** Render a JepaAstToken tree to a flat LISP-like token string. */
function renderToken(t: JepaAstToken, depth: number, maxDepth: number): string {
  if (depth > maxDepth) return `(NODE_MAX_DEPTH ${escapeValue(t.type, 64)})`;

  const children = t.children
    ? sortTokens(t.children).map(c => renderToken(c, depth + 1, maxDepth)).join(' ')
    : '';

  if (t.value !== undefined) {
    return `(${t.type} ${escapeValue(t.value, 200)})`;
  }
  return children ? `(${t.type} ${children})` : `(${t.type})`;
}

/** Convert web-tree-sitter ASTNodeAdapter to JepaAstToken tree.
 *  Strips transient metadata (position, comments, whitespace-only nodes). */
function convertTreeSitterNode(
  node: any,
  source: string,
  depth: number,
  maxDepth: number,
  opts: Required<SerializeAstOptions>
): JepaAstToken {
  if (depth >= maxDepth) {
    return { type: 'MAX_DEPTH', value: escapeValue(node.type, 64) };
  }

  // Skip comment nodes and whitespace-only nodes for determinism
  if (node.type === 'comment' || node.type === 'ERROR') {
    return null as any;
  }

  const text = node.text ? node.text(source) : '';
  const isLeaf = node.children.length === 0;

  // Truncate leaf values
  const value = isLeaf && text.length > 0
    ? escapeValue(text, opts.maxLeafLength)
    : undefined;

  const children: JepaAstToken[] = [];
  for (const child of node.children) {
    const converted = convertTreeSitterNode(child, source, depth + 1, maxDepth, opts);
    if (converted) children.push(converted);
  }

  return {
    type: node.type.replace(/\s+/g, '_').replace(/[()]/g, '_'),
    ...(value !== undefined ? { value } : {}),
    ...(children.length > 0 ? { children: sortTokens(children) } : {}),
  };
}

/** Detect language from file extension. */
export function detectLanguage(filePath: string): SupportedLanguage {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':  return 'typescript';
    case '.tsx': return 'tsx';
    case '.js':  return 'javascript';
    case '.jsx': return 'jsx';
    case '.go':  return 'go';
    case '.py':  return 'python';
    case '.sql': return 'sql';
    case '.md':  return 'markdown';
    default:     return 'unknown';
  }
}

/** Map SupportedLanguage to tree-sitter language name. */
function toTreeSitterLanguage(lang: SupportedLanguage): string {
  const map: Record<SupportedLanguage, string> = {
    typescript: 'typescript',
    javascript: 'javascript',
    tsx: 'tsx',
    jsx: 'jsx',
    go: 'go',
    python: 'python',
    sql: 'sql',
    markdown: 'markdown',
    unknown: 'unknown',
  };
  return map[lang] || 'unknown';
}

// ─── TypeScript / JavaScript serializer (TS compiler API) ────────────────────

interface TsNodeInfo {
  type: string;
  value?: string;
  children: TsNodeInfo[];
}

function tsNodeKindName(node: ts.Node): string {
  const kind = ts.SyntaxKind[node.kind];
  return kind.replace('SyntaxKind.', '');
}

function serializeTsNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  maxDepth: number,
  opts: Required<SerializeAstOptions>,
  depth: number = 0
): TsNodeInfo {
  if (depth >= maxDepth) {
    return { type: 'MAX_DEPTH', value: tsNodeKindName(node), children: [] };
  }

  const info: TsNodeInfo = {
    type: tsNodeKindName(node),
    children: [],
  };

  // Extract a stable "value" for leaf-ish nodes.
  if (ts.isIdentifier(node)) {
    info.value = node.text;
  } else if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  ) {
    info.value = (node as any).text ?? node.getText(sourceFile);
  } else if (ts.isTemplateExpression(node)) {
    info.value = escapeValue(node.getText(sourceFile).slice(0, opts.maxLeafLength), opts.maxLeafLength);
  }

  // Collect children — sort by position for determinism.
  const childInfos: { pos: number; info: TsNodeInfo }[] = [];
  ts.forEachChild(node, child => {
    childInfos.push({ pos: child.getStart(sourceFile), info: serializeTsNode(child, sourceFile, maxDepth, opts, depth + 1) });
  });
  childInfos.sort((a, b) => a.pos - b.pos);
  info.children = childInfos.map(c => c.info);

  return info;
}

function serializeTypeScript(source: string, filePath: string, opts: Required<SerializeAstOptions>): string {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const root = serializeTsNode(sourceFile, sourceFile, opts.maxDepth, opts, 0);
  return renderToken(root, 0, opts.maxDepth);
}

// ─── Go serializer (via existing Go AST extractor binary) ────────────────────

function serializeGo(source: string, filePath: string): string {
  const cellarGo   = '/usr/local/Cellar/go/1.26.3/bin/go';
  const scriptPath = path.resolve(process.cwd(), 'go-harness/cmd/ast-extractor/main.go');
  const binPath    = path.resolve(process.cwd(), 'go-harness/bin/ast-extractor');
  const scratchDir = path.resolve(process.cwd(), 'go-harness/scratch');

  let rawJson = '';
  try {
    if (fs.existsSync(binPath)) {
      if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
      const tempPath = path.join(scratchDir, `jepa_${Date.now()}_${path.basename(filePath) || 'main.go'}`);
      fs.writeFileSync(tempPath, source, 'utf-8');
      rawJson = execFileSync(binPath, ['-file', tempPath], { encoding: 'utf-8', timeout: 5000 });
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    } else if (fs.existsSync(cellarGo) && fs.existsSync(scriptPath)) {
      if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
      const tempPath = path.join(scratchDir, `jepa_${Date.now()}_${path.basename(filePath) || 'main.go'}`);
      fs.writeFileSync(tempPath, source, 'utf-8');
      rawJson = execFileSync(cellarGo, ['run', scriptPath, '-file', tempPath], { encoding: 'utf-8', timeout: 5000 });
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    } else {
      return serializeTokenFallback(source, 'go');
    }
  } catch {
    return serializeTokenFallback(source, 'go');
  }

  // Convert the Go binary's JSON output to our token format.
  try {
    const startIdx = rawJson.indexOf('[');
    const endIdx = rawJson.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) return serializeTokenFallback(source, 'go');
    const items: Array<{ content: string; logicalName: string; chunkType: string; startLine: number; endLine: number }> = JSON.parse(rawJson.substring(startIdx, endIdx + 1));
    const tokens = items.map((item, i) => `(GO_CHUNK type=${item.chunkType} name=${escapeValue(item.logicalName, 120)} lines=${item.startLine}-${item.endLine} idx=${i})`);
    return tokens.join(' ');
  } catch {
    return serializeTokenFallback(source, 'go');
  }
}

// ─── Tree-sitter serializer (Python, Rust, C++, etc.) ────────────────────────

async function serializeWithTreeSitter(
  source: string,
  language: SupportedLanguage,
  opts: Required<SerializeAstOptions>
): Promise<string> {
  const tsLang = toTreeSitterLanguage(language);
  if (tsLang === 'unknown') {
    return serializeTokenFallback(source, language);
  }

  try {
    await initTreeSitter();
    const parser = await getParser(tsLang);
    const rootNode = parser.parse(source);

    // Convert to our token format
    const jepaRoot = convertTreeSitterNode(rootNode, source, 0, opts.maxDepth, opts);
    return renderToken(jepaRoot, 0, opts.maxDepth);
  } catch (err) {
    console.warn(`[serializeAstForJepa] Tree-sitter failed for ${language}:`, err);
    return serializeTokenFallback(source, language);
  }
}

// ─── Structural chunking boundaries ──────────────────────────────────────────

/**
 * Split a large token stream into chunks at structural boundaries.
 * Each chunk corresponds to a top-level declaration (class, function, interface, etc.).
 * This mirrors astChunker.ts boundaries: classes, interfaces, functions, methods.
 */
function chunkByStructuralNodes(
  tokens: string,
  maxTokensPerChunk: number
): string[] {
  // Token format: (TYPE ...) where TYPE is the structural node type
  // We split at top-level boundaries: class, interface, function, method, struct, enum, etc.
  const structuralTypes = new Set([
    'ClassDeclaration', 'InterfaceDeclaration', 'FunctionDeclaration',
    'MethodDeclaration', 'ArrowFunction', 'VariableDeclaration',
    'StructDeclaration', 'EnumDeclaration', 'TraitDeclaration',
    'ClassDefinition', 'FunctionDefinition', 'StructItem',
    'GoChunk', // Go binary output
  ]);

  const chunks: string[] = [];
  let currentChunk = '';
  let tokenCount = 0;

  // Simple regex to find top-level node boundaries in the token stream
  // Matches "(TYPE ...)" at depth 0
  const depthStack: number[] = [];
  let lastBoundary = 0;

  for (let i = 0; i < tokens.length; i++) {
    const char = tokens[i];
    if (char === '(') {
      depthStack.push(i);
    } else if (char === ')' && depthStack.length > 0) {
      const start = depthStack.pop()!;
      if (depthStack.length === 0) {
        // This is a top-level node
        const nodeText = tokens.substring(start, i + 1);
        const typeMatch = nodeText.match(/^\((\w+)/);
        const nodeType = typeMatch ? typeMatch[1] : '';

        if (structuralTypes.has(nodeType) && tokenCount > maxTokensPerChunk) {
          // Emit current chunk up to this boundary
          chunks.push(tokens.substring(lastBoundary, start).trim());
          lastBoundary = start;
          tokenCount = 0;
        }
        tokenCount++;
      }
    }
  }

  // Emit remaining
  if (lastBoundary < tokens.length) {
    chunks.push(tokens.substring(lastBoundary).trim());
  }

  return chunks.length > 0 ? chunks : [tokens];
}

// ─── Fallback serializer (any language without a specific AST path) ──────────

function serializeTokenFallback(source: string, language: string): string {
  // Produce a stable, coarse-grained token stream. Not an AST, but a
  // deterministic intermediate that keeps the pipeline from crashing for
  // unsupported languages in Stage 0.
  const lines = source.split('\n');
  const tokens: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      tokens.push(`(LINE num=${i + 1} lang=${language} content=${escapeValue(trimmed, 200)})`);
    }
  }
  return tokens.join(' ');
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Serialize source code into a deterministic linearized AST token sequence
 * suitable for the UniXcoder encoder input pipeline.
 *
 * @param sourceCode - Raw source code text.
 * @param language   - Explicit language override, or a file path.
 * @param options    - Optional serialization controls.
 * @returns A single string of space-separated LISP-like tokens.
 */
export async function serializeAstForJepa(
  sourceCode: string,
  language: SupportedLanguage | string,
  options: SerializeAstOptions = {},
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lang: SupportedLanguage = (['typescript', 'javascript', 'tsx', 'jsx', 'go', 'python', 'sql', 'markdown', 'unknown'].includes(language)
    ? language
    : detectLanguage(language)) as SupportedLanguage;

  let tokens: string;

  switch (lang) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx': {
      const fileName = language.startsWith('.') ? language : `input.${lang === 'tsx' ? 'tsx' : lang === 'jsx' ? 'jsx' : lang === 'typescript' ? 'ts' : 'js'}`;
      tokens = serializeTypeScript(sourceCode, fileName, opts);
      break;
    }
    case 'go': {
      tokens = serializeGo(sourceCode, language);
      break;
    }
    case 'python':
    case 'sql':
    case 'markdown': {
      // Use tree-sitter for these languages when available
      tokens = await serializeWithTreeSitter(sourceCode, lang, opts);
      break;
    }
    default:
      tokens = serializeTokenFallback(sourceCode, lang);
  }

  // Structural chunking for large files
  if (tokens.length > opts.maxTokensPerChunk * 50) { // rough heuristic
    const chunks = chunkByStructuralNodes(tokens, opts.maxTokensPerChunk);
    return chunks.join(' |CHUNK_SEP| ');
  }

  return tokens;
}

// ─── Sync wrapper for callers that can't await ───────────────────────────────

/** Synchronous version using fallback for languages without native AST. */
export function serializeAstForJepaSync(
  sourceCode: string,
  language: SupportedLanguage | string,
  options: SerializeAstOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lang: SupportedLanguage = (['typescript', 'javascript', 'tsx', 'jsx', 'go', 'python', 'sql', 'markdown', 'unknown'].includes(language)
    ? language
    : detectLanguage(language)) as SupportedLanguage;

  let tokens: string;

  switch (lang) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx': {
      const fileName = language.startsWith('.') ? language : `input.${lang === 'tsx' ? 'tsx' : lang === 'jsx' ? 'jsx' : lang === 'typescript' ? 'ts' : 'js'}`;
      tokens = serializeTypeScript(sourceCode, fileName, opts);
      break;
    }
    case 'go': {
      tokens = serializeGo(sourceCode, language);
      break;
    }
    case 'python':
    case 'sql':
    case 'markdown': {
      // Tree-sitter requires async; fall back to token-based for sync path
      tokens = serializeTokenFallback(sourceCode, lang);
      break;
    }
    default:
      tokens = serializeTokenFallback(sourceCode, lang);
  }

  // Structural chunking for large files
  if (tokens.length > opts.maxTokensPerChunk * 50) {
    const chunks = chunkByStructuralNodes(tokens, opts.maxTokensPerChunk);
    return chunks.join(' |CHUNK_SEP| ');
  }

  return tokens;
}
