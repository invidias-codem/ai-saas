/**
 * lib/jepa/treeSitterLoader.ts
 *
 * Async loader for web-tree-sitter WASM modules. Stage 0 implementation:
 * defines the interface and a lazy-initialisation path. The actual
 * `web-tree-sitter` npm package is NOT installed at Stage 0 — this module
 * provides the contract and a no-op stub so callers can be wired without
 * blocking on the WASM build step.
 *
 * Stage 1/2 work:
 *  1. Install `web-tree-sitter` (no native bindings — pure WASM).
 *  2. Compile language parsers to `public/tree-sitter/` following the plan
 *     in research/world-model/tree-sitter-wasm-staging-plan.md.
 *  3. Drop the `.wasm` files into `public/tree-sitter/` — do NOT commit
 *     compiled language `.wasm` binaries larger than ~1 MB each; they are
 *     generated at deploy time by the CI pipeline (see plan).
 *  4. Set the feature flag `ENABLE_JEPA_WASM=true` to activate the loader.
 *
 * WASM Asset Routing Strategy (serverless-safe):
 *  - All WASM files MUST be placed in `public/tree-sitter/` at build time.
 *  - The `locateFile` callback MUST return an absolute URL path that
 *    Vercel/Edge runtime can serve without filesystem access.
 *  - We do NOT use dynamic `import()` for WASM files — they are served
 *    as static assets from the public directory.
 *  - In development, we serve from `/tree-sitter/`; in production, the
 *    same path works because Next.js serves `public/` at the root.
 *
 * Usage:
 *
 *   import { initTreeSitter, getParser, ParserAdapter } from '@/lib/jepa/treeSitterLoader';
 *
 *   // One-time init (cheap no-op when WASM is unavailable).
 *   await initTreeSitter();
 *
 *   // Build a parser for a specific language.
 *   const parser = await getParser('typescript');
 *   const tree = parser.parse('function foo() {}');
 *   const root = tree.rootNode;
 *
 * Acceptance criteria (§8 of spec):
 *  "Build async loader that works in both Node.js (SSR) and browser contexts."
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** WASM root directory inside the Next.js public/ folder. */
export const TREE_SITTER_WASM_DIR = '/tree-sitter';

/** Known language modules and their WASM file names. */
export const LANGUAGE_WASM_FILES: Record<string, string> = {
  typescript: 'tree-sitter-typescript.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  tsx:        'tree-sitter-tsx.wasm',
  jsx:        'tree-sitter-tsx.wasm',
  go:         'tree-sitter-go.wasm',
  python:     'tree-sitter-python.wasm',
  c:          'tree-sitter-c.wasm',
  cpp:        'tree-sitter-cpp.wasm',
  rust:       'tree-sitter-rust.wasm',
  java:       'tree-sitter-java.wasm',
};

/** Feature-flag key for gating WASM loading (stored in Upstash or env). */
export const JEPA_WASM_FEATURE_FLAG = 'ENABLE_JEPA_WASM';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal subset of web-tree-sitter Parser — implemented in Stage 1. */
export interface ParserAdapter {
  /** Parse source and return the root node. */
  parse(source: string, languageName?: string): AstNodeAdapter;
  /** Set the language for subsequent parse calls. */
  setLanguage(name: string): void;
  /** Delete the parser and free WASM memory. */
  delete(): void;
}

/** Minimal AST node interface — mirrors web-tree-sitter Node API. */
export interface AstNodeAdapter {
  type: string;
  startPosition: { row: number; column: number };
  endPosition:   { row: number; column: number };
  /** Child nodes (empty array for leaves). */
  children: AstNodeAdapter[];
  /** Raw text of this node — computed lazily by the caller supplying source. */
  text(source: string): string;
}

// ─── State ────────────────────────────────────────────────────────────────────

let initPromise: Promise<void> | null = null;
let parserCache: Map<string, ParserAdapter> = new Map();

// ─── Feature-flag check ────────────────────────────────────────────────────────

function isWasmEnabled(): boolean {
  // Gate on env var in Stage 0 so no code path crashes if the WASM files
  // have not yet been compiled.
  return process.env[JEPA_WASM_FEATURE_FLAG] === 'true';
}

// ─── Stub parser (active when WASM is unavailable) ────────────────────────────

/**
 * Stub adapter that throws on parse. Exists so the module can be imported
 * in any environment without crashing; actual parsing requires WASM files.
 */
class StubParser implements ParserAdapter {
  constructor(private readonly languageName: string) {}
  parse(_source: string): AstNodeAdapter {
    throw new Error(
      `[TreeSitterLoader] web-tree-sitter WASM not initialized. ` +
      `Set ${JEPA_WASM_FEATURE_FLAG}=true and ensure ${TREE_SITTER_WASM_DIR}/*.wasm are deployed. ` +
      `See research/world-model/tree-sitter-wasm-staging-plan.md for the build process.`,
    );
  }
  setLanguage(_name: string): void { /* no-op */ }
  delete(): void { /* no-op */ }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * One-time initialisation of the WASM loader. Safe to call multiple times;
 * concurrent calls share a single init promise.
 *
 * In Stage 0 this is a no-op unless `ENABLE_JEPA_WASM=true`.
 */
export async function initTreeSitter(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!isWasmEnabled()) {
      console.log('[TreeSitterLoader] WASM disabled (feature flag off). Using stub mode.');
      return;
    }

    try {
      // @ts-ignore — web-tree-sitter not installed in Stage 0; installed at Stage 1/2
      // webpackIgnore: true prevents Next.js from tracing this optional dependency.
      const { Parser } = await import(/* webpackIgnore: true */ 'web-tree-sitter');
      const wasmRoot = getWasmRoot();

      await Parser.init({
        locateFile: (file: string) => `${wasmRoot}/${file}`,
      });

      console.log(`[TreeSitterLoader] web-tree-sitter WASM initialised from ${wasmRoot}`);
    } catch (err) {
      console.error('[TreeSitterLoader] WASM init failed; falling back to stub mode:', err);
    }
  })();

  return initPromise;
}

/**
 * Return a ParserAdapter for the given language. The adapter is cached per
 * language so repeated calls are cheap.
 *
 * @param language - Canonical language name (e.g. 'typescript', 'go', 'python').
 * @returns A ParserAdapter. Throws or delegates to stub if WASM unavailable.
 */
export async function getParser(language: string): Promise<ParserAdapter> {
  const cacheKey = language.toLowerCase();

  if (parserCache.has(cacheKey)) {
    return parserCache.get(cacheKey)!;
  }

  if (!isWasmEnabled()) {
    parserCache.set(cacheKey, new StubParser(cacheKey));
    return parserCache.get(cacheKey)!;
  }

  try {
    // Dynamic import — only resolved at call time in Stage 1/2.
    // @ts-ignore — web-tree-sitter not installed in Stage 0
    // webpackIgnore: true prevents Next.js from tracing this optional dependency.
    const { Parser, Language } = await import(/* webpackIgnore: true */ 'web-tree-sitter');

    // Resolve the WASM module path for this language.
    const wasmFileName = LANGUAGE_WASM_FILES[cacheKey];
    if (!wasmFileName) {
      throw new Error(`[TreeSitterLoader] No WASM module registered for language '${language}'`);
    }

    const wasmRoot = getWasmRoot();
    const wasmPath = `${wasmRoot}/${wasmFileName}`;

    // Fetch the WASM bytes and create the Language.
    const wasmResponse = await fetch(wasmPath);
    if (!wasmResponse.ok) {
      throw new Error(`[TreeSitterLoader] Failed to fetch WASM for ${language} from ${wasmPath}: ${wasmResponse.status}`);
    }
    const wasmBytes = await wasmResponse.arrayBuffer();

    // Create the Language instance.
    const languageObj = new Language(new Uint8Array(wasmBytes));

    // Create and configure the Parser.
    const parser = new Parser();
    parser.setLanguage(languageObj);

    // Wrap in our adapter interface.
    const adapter: ParserAdapter = {
      parse: (source: string, _languageName?: string) => {
        const tree = parser.parse(source);
        return adaptTreeSitterNode(tree.rootNode);
      },
      setLanguage: (_name: string) => {
        // Language is fixed at creation time; ignore re-sets.
      },
      delete: () => {
        parser.delete();
      },
    };

    parserCache.set(cacheKey, adapter);
    console.log(`[TreeSitterLoader] Parser for '${language}' initialised from ${wasmPath}`);
    return adapter;
  } catch (err) {
    console.error(`[TreeSitterLoader] getParser('${language}') failed:`, err);
    const stub = new StubParser(cacheKey);
    parserCache.set(cacheKey, stub);
    return stub;
  }
}

/**
 * Convert a web-tree-sitter Node to our AstNodeAdapter interface.
 * This is a thin wrapper — the actual tree-sitter Node is returned directly
 * since it already matches our interface (type, children, startPosition, etc.).
 */
function adaptTreeSitterNode(node: any): AstNodeAdapter {
  return {
    type: node.type,
    startPosition: node.startPosition,
    endPosition: node.endPosition,
    children: node.children.map(adaptTreeSitterNode),
    text: (source: string) => source.slice(node.startIndex, node.endIndex),
  };
}

/**
 * Flush the parser cache. Primarily used in tests.
 */
export function clearParserCache(): void {
  for (const parser of parserCache.values()) {
    try { parser.delete(); } catch { /* no-op */ }
  }
  parserCache.clear();
  initPromise = null;
}

/**
 * Resolve the WASM root directory. In the browser this is the public/ URL;
 * in Node.js SSR we use the project root's public/ directory.
 *
 * This MUST return a URL path that can be served by the web server.
 * In Vercel/Next.js, files in `public/` are served at the root path.
 * We configure `locateFile` to prepend this root so the WASM runtime
 * loads `tree-sitter.wasm` and `tree-sitter-<lang>.wasm` from the
 * correct public URL.
 */
function getWasmRoot(): string {
  // In a Next.js serverless function, the public directory is served at the
  // root. The basePath is empty unless NEXT_PUBLIC_BASE_PATH is set.
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  // The locateFile callback receives just the filename (e.g. "tree-sitter.wasm")
  // and must return the full URL path. We point it at public/tree-sitter/.
  const publicDir = process.env.TREE_SITTER_PUBLIC_DIR || `${basePath}${TREE_SITTER_WASM_DIR}`;
  return publicDir;
}
