# Web-Tree-Sitter WASM Staging Plan

**Stage 0 artifact** — this document specifies the exact compile and ship
process for `tree-sitter.wasm` and language parsers. It must exist before
`public/tree-sitter/` contains any binary artifacts.

**Do not commit compiled `.wasm` binaries** to the repository. The build
pipeline generates them at deploy time. Only this plan and the loader code
(`lib/jepa/treeSitterLoader.ts`) are checked in.

---

## 1. Directory Layout

```
public/tree-sitter/
├── README.md          ← this file (copy of the staging plan for ops)
├── tree-sitter.wasm   ← core web-tree-sitter runtime (generated)
├── tree-sitter-typescript.wasm
├── tree-sitter-javascript.wasm
├── tree-sitter-tsx.wasm
├── tree-sitter-go.wasm
├── tree-sitter-python.wasm
└── ... (one .wasm per supported language)
```

`lib/jepa/treeSitterLoader.ts` loads from this directory using a
`locateFile` override so the WASM runtime resolves relative paths correctly
in both the browser and Node.js SSR contexts.

---

## 2. Package Installation (Stage 1, CI step)

**Do not add to the main production dependencies.** Install as a
dev-dependency only, in the CI job that produces the WASM bundle:

```bash
npm install --save-dev web-tree-sitter
```

`web-tree-sitter` ships with pre-built WASM files for JavaScript and
TypeScript. For other languages we must compile the parsers ourselves.

---

## 3. Language Parser Compilation

### 3.1 Prerequisites

- `clang` (or `emcc` for Emscripten cross-compilation)
- `cmake` ≥ 3.16
- `ninja-build` (recommended for fast incremental builds)
- Node.js ≥ 18
- Git

### 3.2 Compile a Language Parser

Each language parser is a separate project cloned from the
`tree-sitter` organization. The build steps are the same for every language:

```bash
# 1. Clone the parser repo.
git clone https://github.com/tree-sitter/tree-sitter-<language>.git
cd tree-sitter-<language>

# 2. Generate the WASM compilation scaffold using tree-sitter CLI.
#    The CLI must be installed globally:
npm install -g tree-sitter-cli

# 3. Compile to WASM.
#    The CLI emits a .wasm file into the current directory.
tree-sitter build-wasm

# 4. The output file is named:
#    tree-sitter-<language>.wasm
#    Copy it to the staging directory (not the repo):
cp tree-sitter-<language>.wasm /tmp/ts-wasm-staging/
```

For **TypeScript and JavaScript**, the `web-tree-sitter` npm package already
includes compiled WASM files. Locate them in `node_modules/web-tree-sitter/`
after `npm install`:

```bash
cp node_modules/web-tree-sitter/tree-sitter.wasm            /tmp/ts-wasm-staging/
cp node_modules/web-tree-sitter/tree-sitter-typescript.wasm  /tmp/ts-wasm-staging/
cp node_modules/web-tree-sitter/tree-sitter-javascript.wasm  /tmp/ts-wasm-staging/
cp node_modules/web-tree-sitter/tree-sitter-tsx.wasm         /tmp/ts-wasm-staging/
```

### 3.3 Supported Languages (Stage 1 scope)

| Language    | Repo                                       | WASM file name               |
|-------------|--------------------------------------------|-------------------------------|
| TypeScript  | tree-sitter/tree-sitter-typescript          | tree-sitter-typescript.wasm   |
| JavaScript  | bundled with TypeScript above               | tree-sitter-javascript.wasm   |
| TSX         | bundled with TypeScript above               | tree-sitter-tsx.wasm          |
| Go          | tree-sitter/tree-sitter-go                  | tree-sitter-go.wasm           |
| Python      | tree-sitter/tree-sitter-python              | tree-sitter-python.wasm       |

Add additional languages in Stage 2/3 by repeating §3.2.

---

## 4. CI Pipeline (GitHub Actions)

Add a CI job `.github/workflows/tree-sitter-wasm.yml` that runs on changes
to the staging plan or the language list. The job:

1. Checks out the repo.
2. Installs `web-tree-sitter` (dev-dependency).
3. Compiles each language parser.
4. Uploads the WASM files as a GitHub Actions artifact (`ts-wasm-bundle`).
5. **Does NOT commit the files to git** — they land in `public/tree-sitter/`
   via a deploy step described in §5.

```yaml
name: Build Tree-Sitter WASM

on:
  push:
    paths:
      - 'research/world-model/tree-sitter-wasm-staging-plan.md'
      - 'lib/jepa/treeSitterLoader.ts'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      wasm-url: ${{ steps.upload.outputs.wasm-url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install tree-sitter CLI
        run: npm install -g tree-sitter-cli

      - name: Build WASM parsers
        run: |
          mkdir -p /tmp/ts-wasm-staging
          # TypeScript / JS (pre-built in web-tree-sitter)
          npm install --save-dev web-tree-sitter
          cp node_modules/web-tree-sitter/tree-sitter.wasm            /tmp/ts-wasm-staging/
          cp node_modules/web-tree-sitter/tree-sitter-typescript.wasm  /tmp/ts-wasm-staging/
          cp node_modules/web-tree-sitter/tree-sitter-javascript.wasm  /tmp/ts-wasm-staging/
          cp node_modules/web-tree-sitter/tree-sitter-tsx.wasm         /tmp/ts-wasm-staging/
          # Go (compile from source)
          git clone --depth 1 https://github.com/tree-sitter/tree-sitter-go.git /tmp/ts-go
          cd /tmp/ts-go && tree-sitter build-wasm
          cp tree-sitter-go.wasm /tmp/ts-wasm-staging/
          cd /
          # Python (compile from source)
          git clone --depth 1 https://github.com/tree-sitter/tree-sitter-python.git /tmp/ts-py
          cd /tmp/ts-py && tree-sitter build-wasm
          cp tree-sitter-python.wasm /tmp/ts-wasm-staging/

      - name: Upload WASM bundle
        uses: actions/upload-artifact@v4
        with:
          name: ts-wasm-bundle
          path: /tmp/ts-wasm-staging/
          retention-days: 30
          compression-level: 0  # WASM files are already compressed
```

---

## 5. Deploy Integration (Vercel)

WASM files must be present in `public/tree-sitter/` at build time so
Next.js copies them into the Vercel serverless function output. Two options:

### Option A — Manual deployment step

Before running `vercel deploy` or `next build`, download the artifact
locally:

```bash
# Download the latest ts-wasm-bundle artifact (GitHub CLI).
gh run download --name ts-wasm-bundle --dir public/tree-sitter/
```

Then `git add public/tree-sitter/*.wasm` only for the deploy commit — the
`.gitignore` should exclude these files from normal commits.

**.gitignore entry:**

```
# Web-tree-sitter WASM artifacts — generated at deploy time.
public/tree-sitter/*.wasm
```

### Option B — Vercel Environment Variable + remote fetch

Store the WASM bundle URL in a Vercel environment variable
(`TREE_SITTER_WASM_BUNDLE_URL`). At cold start, `treeSitterLoader.ts`
fetches the `.wasm` files into the Vercel `/tmp` directory and loads them
from there. This avoids adding `.wasm` files to the build output at all.

```typescript
// In treeSitterLoader.ts (Stage 1/2 extension):
const bundleUrl = process.env.TREE_SITTER_WASM_BUNDLE_URL;
if (bundleUrl) {
  const wasmRoot = '/tmp/tree-sitter-wasm/';
  await fs.mkdir(wasmRoot, { recursive: true });
  for (const [lang, fileName] of Object.entries(LANGUAGE_WASM_FILES)) {
    const dest = path.join(wasmRoot, fileName);
    if (!(await fs.promises.access(dest).then(() => true).catch(() => false))) {
      const res = await fetch(`${bundleUrl}/${fileName}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.promises.writeFile(dest, buf);
    }
  }
  // Point locateFile at the local cache.
  wasmRootOverride = wasmRoot;
}
```

---

## 6. Vercel Bundle Size Compliance

Vercel limits serverless functions to **250 MB uncompressed**. The total
uncompressed size of all WASM artifacts must be measured and documented:

| File                         | Approx size (uncompressed) |
|------------------------------|---------------------------|
| tree-sitter.wasm             | ~2 MB                     |
| tree-sitter-typescript.wasm  | ~3 MB                     |
| tree-sitter-javascript.wasm  | ~2 MB                     |
| tree-sitter-tsx.wasm         | ~3 MB                     |
| tree-sitter-go.wasm          | ~3 MB                     |
| tree-sitter-python.wasm      | ~4 MB                     |
| **Total**                    | **~17 MB**                |

These are served as static files from `/public/tree-sitter/` — they do NOT
count toward the serverless function bundle size as long as they are not
imported in application code. `web-tree-sitter` and `onnxruntime-web` ARE
imported and do count. Verify with:

```bash
npx @vercel/ncc build lib/jepa/treeSitterLoader.ts --out dist/jepa
du -sh dist/jepa
```

**Kill criterion (per spec §7.3):** If uncompressed WASM bundle exceeds
150 MB or P95 cold-start exceeds 600 ms, re-evaluate (smaller model,
external inference API, or edge compute).

---

## 7. Acceptance Verification

After the WASM files are staged in `public/tree-sitter/`, run this
verification script:

```typescript
// scripts/verify-tree-sitter-wasm.ts
import { initTreeSitter, getParser, TREE_SITTER_WASM_DIR, LANGUAGE_WASM_FILES } from '@/lib/jepa/treeSitterLoader';

async function verify() {
  process.env.ENABLE_JEPA_WASM = 'true';

  const t0 = Date.now();
  await initTreeSitter();
  const initMs = Date.now() - t0;
  console.log(`Init: ${initMs}ms`);

  for (const [lang, file] of Object.entries(LANGUAGE_WASM_FILES)) {
    const t1 = Date.now();
    const parser = await getParser(lang);
    const tree = parser.parse(`// sample ${lang} code\nfunction hello() { return 1; }\n`);
    const root = tree.rootNode;
    const parseMs = Date.now() - t1;
    console.log(`${lang}: type=${root.type} children=${root.children.length} ${parseMs}ms`);
    parser.delete();
  }

  console.log(`\nCold-start: ${initMs}ms (threshold: 600ms)`);
  if (initMs > 600) {
    console.error('FAIL: cold-start exceeds 600ms threshold');
    process.exit(1);
  }
  console.log('PASS');
}

verify().catch(e => { console.error(e); process.exit(1); });
```

Run with:

```bash
ENABLE_JEPA_WASM=true npx tsx scripts/verify-tree-sitter-wasm.ts
```

---

## 8. Non-Negotiable Constraints (from spec)

- **No paid external services** — everything is self-hosted.
- **No native node bindings** — use `web-tree-sitter` (WASM), not `tree-sitter` (native).
- **No changes to production generation paths** unless gated behind `ENABLE_JEPA_WASM`.
- **Deterministic output** — the same source → same AST node sequence.
