import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '..');
const outPath = path.join(projectRoot, 'public/governance/asset-manifest.json');

const providers = [
  {
    id: 'hermes',
    mode: ['agentic', 'fast', 'quality'],
    envKey: process.env.NOUSE_API_KEY ? 'configured' : 'missing',
    modelEnv: 'NOUS_MODEL_ID',
    defaultModel: process.env.NOUSE_API_KEY ? (process.env.NOUSE_MODEL_ID || 'Hermes-4-70B') : null,
    note: 'Primary agentic rider; falls back to Gemini when NOUSE_API_KEY is absent'
  },
  {
    id: 'gemini',
    mode: ['fast', 'quality', 'agentic-fallback'],
    envKey: process.env.GOOGLE_API_KEY ? 'configured' : 'missing',
    modelEnv: 'HERMES_MODEL_ID',
    defaultModel: process.env.HERMES_MODEL_ID || 'gemini-3.1-pro-preview',
    note: 'Cloud fallback and multimodal forwarding'
  },
  {
    id: 'claude-byok',
    mode: ['agentic-fallback'],
    envKey: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing',
    modelEnv: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-sonnet-4-6',
    note: 'BYOK only; not default unless Anthropic key is present'
  }
];

const tools = [
  { name: 'web_search', registry: 'agentic', risk: 'analysis', envScoped: false },
  { name: 'read_file', registry: 'agentic', risk: 'read-only', envScoped: false },
  { name: 'write_file', registry: 'agentic', risk: 'mutative', envScoped: false },
  { name: 'patch_file', registry: 'agentic', risk: 'mutative', envScoped: false },
  { name: 'execute_command', registry: 'agentic', risk: 'mutative', envScoped: true, note: 'Phase 1 local mutable capability' },
  { name: 'search_codebase', registry: 'agentic', risk: 'analysis', envScoped: false },
  { name: 'discover_documents', registry: 'agentic', risk: 'analysis', envScoped: false },
  { name: 'extract_text', registry: 'agentic', risk: 'analysis', envScoped: false },
  { name: 'summarize_repo', registry: 'agentic', risk: 'analysis', envScoped: false },
  { name: 'semantic_search', registry: 'agentic', risk: 'analysis', envScoped: false },
  { name: 'deal_sentinel', registry: 'agentic', risk: 'analysis', envScoped: false },
  { name: 'research_writer', registry: 'agentic', risk: 'mutative', envScoped: false },
  { name: 'novel_writer', registry: 'agentic', risk: 'mutative', envScoped: false },
  { name: 'gh_commits', registry: 'cli', risk: 'analysis', envScoped: true },
  { name: 'create_blog_pr', registry: 'cli', risk: 'mutative', envScoped: true },
  { name: 'gh_mock', registry: 'tasks', risk: 'analysis', envScoped: true },
  { name: 'db_select_mock', registry: 'tasks', risk: 'analysis', envScoped: true },
];

const manifest = {
  generated_at: new Date().toISOString(),
  generated_by: 'scripts/generateAssetManifest.ts',
  phase: 'Phase 1: Governance Baseline',
  providers,
  tools,
  evidence: {
    governance_document: 'governance/ai-boundaries.yaml',
    build_step: 'prebuild',
    compliance_frameworks: ['NIST AI RMF', 'ISO 42001', 'OWASP AI Exchange', 'OWASP Agentic Top 10', 'CSA AICM']
  }
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`Asset manifest written to ${outPath}`);
