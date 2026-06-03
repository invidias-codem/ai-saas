/**
 * lib/ucol/sudoLoader.ts
 *
 * SudoLang Prompt Loader — reusable UCOL module for loading .sudo.md prompt
 * definitions at runtime. Generalizes the BlueskyResponder's inline
 * loadSudoPrompt() pattern so any UCOL agent can use it.
 *
 * Resolution order (first match wins):
 *   1. In-memory cache (if not expired)
 *   2. Named registry → registered file path
 *   3. Convention path: lib/ucol/agents/prompts/<name>.sudo.md
 *   4. Agent-local path: lib/agents/<name>/prompts/<name>.sudo.md
 *   5. fallback option string (if provided)
 *   6. Throw (if strict: true)
 *   7. Empty string + console.warn
 */

import fs from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SudoPrompt {
  /** Logical name, e.g. "tech-genie-bluesky" */
  name: string;
  /** Resolved absolute file path */
  path: string;
  /** Full .sudo.md file content */
  content: string;
  /** ISO timestamp of when this entry was loaded */
  loadedAt: string;
  /** True when the content was served from the in-memory cache */
  cached: boolean;
}

export interface SudoLoaderOptions {
  /** How long to cache loaded prompts in milliseconds. Default: 5 minutes (300_000). */
  cacheMs?: number;
  /** Inline SudoLang fallback string used when the file cannot be found. */
  fallback?: string;
  /**
   * When true, throw a SudoLoaderError instead of returning an empty string
   * if the file cannot be resolved. Default: false.
   */
  strict?: boolean;
}

// ─── Internal cache entry ─────────────────────────────────────────────────────

interface CacheEntry {
  content: string;
  expiresAt: number;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class SudoLoaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SudoLoaderError';
  }
}

// ─── Module-level state ───────────────────────────────────────────────────────
// Both maps survive the lifetime of the Node.js process (module singleton).

/** name → resolved file path (relative or absolute) */
const promptRegistry = new Map<string, string>();

/** cache key → { content, expiresAt } */
const promptCache = new Map<string, CacheEntry>();

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CACHE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Project root resolved relative to this file.
 * __dirname = lib/ucol  →  two levels up = project root
 */
// Use process.cwd() instead of __dirname to avoid Turbopack tracing the entire
// project tree. The /*turbopackIgnore: true*/ comment prevents NFT from walking
// up from this file.
const PROJECT_ROOT = path.join(/*turbopackIgnore: true*/ process.cwd());

// ─── Registry API ─────────────────────────────────────────────────────────────

/**
 * Register a named prompt and its file path.
 * Paths may be relative (resolved from project root) or absolute.
 */
export function registerPromptPath(name: string, filePath: string): void {
  promptRegistry.set(name, filePath);
}

/**
 * Returns a shallow copy of the current name→path registry.
 */
export function getSudoRegistry(): Record<string, string> {
  return Object.fromEntries(promptRegistry);
}

// ─── Cache API ────────────────────────────────────────────────────────────────

/**
 * Clears all in-memory cache entries.
 * Primarily useful in tests or after hot-reloading prompt files.
 */
export function clearPromptCache(): void {
  promptCache.clear();
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Attempt to read a file synchronously.
 * Returns the string content or null if the file does not exist.
 */
function tryReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Resolve a potentially-relative path against the project root.
 */
function resolvePromptPath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(PROJECT_ROOT, filePath);
}

// ─── Core loader ──────────────────────────────────────────────────────────────

/**
 * Load a .sudo.md prompt by name from the prompts registry.
 *
 * @param name     Logical prompt name (e.g. "tech-genie-bluesky")
 * @param options  SudoLoaderOptions
 * @returns        Full .sudo.md file content (or fallback / empty string)
 */
export async function loadSudoPrompt(
  name: string,
  options: SudoLoaderOptions = {}
): Promise<string> {
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;

  // ── 1. Check cache ─────────────────────────────────────────────────────
  const cached = promptCache.get(name);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.content;
  }

  // ── 2. Registry lookup ─────────────────────────────────────────────────
  const registeredPath = promptRegistry.get(name);
  if (registeredPath) {
    const resolved = resolvePromptPath(registeredPath);
    const content = tryReadFile(resolved);
    if (content !== null) {
      promptCache.set(name, { content, expiresAt: Date.now() + cacheMs });
      return content;
    }
    console.warn(`[sudoLoader] Registered path not readable: ${resolved}`);
  }

  // ── 3. Convention path: lib/ucol/agents/prompts/<name>.sudo.md ─────────
  const ucolConventionPath = path.join(
    PROJECT_ROOT,
    'lib',
    'ucol',
    'agents',
    'prompts',
    `${name}.sudo.md`
  );
  const ucolContent = tryReadFile(ucolConventionPath);
  if (ucolContent !== null) {
    promptCache.set(name, { content: ucolContent, expiresAt: Date.now() + cacheMs });
    return ucolContent;
  }

  // ── 4. Agent-local path: lib/agents/<name>/prompts/<name>.sudo.md ──────
  const agentLocalPath = path.join(
    PROJECT_ROOT,
    'lib',
    'agents',
    name,
    'prompts',
    `${name}.sudo.md`
  );
  const agentLocalContent = tryReadFile(agentLocalPath);
  if (agentLocalContent !== null) {
    promptCache.set(name, { content: agentLocalContent, expiresAt: Date.now() + cacheMs });
    return agentLocalContent;
  }

  // ── 5. Fallback ────────────────────────────────────────────────────────
  if (options.fallback !== undefined) {
    console.warn(
      `[sudoLoader] Could not resolve prompt "${name}" — using inline fallback`
    );
    return options.fallback;
  }

  // ── 6. Strict mode: throw ──────────────────────────────────────────────
  if (options.strict) {
    throw new SudoLoaderError(
      `[sudoLoader] Prompt "${name}" not found and strict mode is enabled`
    );
  }

  // ── 7. Graceful degradation ────────────────────────────────────────────
  console.warn(
    `[sudoLoader] Prompt "${name}" could not be resolved. ` +
    `Tried: registry, lib/ucol/agents/prompts/, lib/agents/${name}/prompts/. ` +
    `Returning empty string.`
  );
  return '';
}

/**
 * Load a .sudo.md prompt from an explicit file path.
 *
 * @param filePath  Absolute or project-relative path to the .sudo.md file
 * @param options   SudoLoaderOptions
 * @returns         Full .sudo.md file content (or fallback / empty string)
 */
export async function loadSudoPromptFromPath(
  filePath: string,
  options: SudoLoaderOptions = {}
): Promise<string> {
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;
  const resolved = resolvePromptPath(filePath);

  // ── 1. Check cache by resolved path ────────────────────────────────────
  const cached = promptCache.get(resolved);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.content;
  }

  // ── 2. Read file ───────────────────────────────────────────────────────
  const content = tryReadFile(resolved);
  if (content !== null) {
    promptCache.set(resolved, { content, expiresAt: Date.now() + cacheMs });
    return content;
  }

  // ── 3. Fallback ────────────────────────────────────────────────────────
  if (options.fallback !== undefined) {
    console.warn(`[sudoLoader] Could not read file "${resolved}" — using inline fallback`);
    return options.fallback;
  }

  // ── 4. Strict mode: throw ──────────────────────────────────────────────
  if (options.strict) {
    throw new SudoLoaderError(
      `[sudoLoader] File not found: "${resolved}" and strict mode is enabled`
    );
  }

  // ── 5. Graceful degradation ────────────────────────────────────────────
  console.warn(`[sudoLoader] Could not read file "${resolved}". Returning empty string.`);
  return '';
}

// ─── Pre-register known UCOL agent prompts ────────────────────────────────────
// These are registered at module load time so they are immediately available
// without any setup call from consuming code.

registerPromptPath(
  'tech-genie-bluesky',
  'lib/agents/bluesky/prompts/tech-genie-bluesky.sudo.md'
);
registerPromptPath(
  'error-classifier',
  'lib/ucol/agents/prompts/error-classifier.sudo.md'
);
registerPromptPath(
  'knowledge-extractor',
  'lib/ucol/agents/prompts/knowledge-extractor.sudo.md'
);
registerPromptPath(
  'agent-router',
  'lib/ucol/agents/prompts/agent-router.sudo.md'
);
