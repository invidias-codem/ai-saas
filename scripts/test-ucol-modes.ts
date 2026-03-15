/**
 * UCOL Toggle Modes — Smoke Test
 * Tests each provider directly (bypasses auth/credits)
 * Run: npx ts-node --project tsconfig.json scripts/test-ucol-modes.ts
 */

import { HermesProvider } from '../lib/llm/providers/hermes';
import { GeminiProvider } from '../lib/llm/providers/gemini';
import { ClaudeProvider } from '../lib/llm/providers/claude';
import { ChatMessage } from '../lib/llm/types';

const TEST_MESSAGE: ChatMessage[] = [
  { role: 'user', text: 'Say exactly: "UCOL test OK" and nothing else.' }
];

async function collectStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result.trim();
}

async function testMode(
  name: string,
  provider: { generateStream: Function },
  timeoutMs = 30000
): Promise<{ ok: boolean; response: string; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      provider.generateStream(TEST_MESSAGE, 'You are a test assistant. Follow instructions exactly.'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]) as any;

    const response = await collectStream(result.stream);
    const latencyMs = Date.now() - start;
    const ok = response.toLowerCase().includes('ucol test ok');

    console.log(`\n[${ ok ? '✅' : '⚠️ '} ${name}] ${latencyMs}ms`);
    console.log(`   Response: "${response.substring(0, 100)}"`);
    if (result.debug) console.log(`   Debug:`, result.debug);

    return { ok, response, latencyMs };
  } catch (error: any) {
    const latencyMs = Date.now() - start;
    console.log(`\n[❌ ${name}] FAILED after ${latencyMs}ms: ${error.message}`);
    return { ok: false, response: '', latencyMs, error: error.message };
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  UCOL Toggle Modes — Smoke Test');
  console.log('═══════════════════════════════════════\n');

  const results: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {};

  // ── FAST MODE: Hermes (Ollama) ──────────────────────────────────────────
  console.log('Testing ⚡ FAST mode (Hermes3 → Gemini fallback)...');
  results.fast = await testMode('FAST (Hermes3)', new HermesProvider(), 15000);

  // ── QUALITY MODE: Gemini Pro ────────────────────────────────────────────
  console.log('\nTesting 🧠 QUALITY mode (Gemini Pro)...');
  results.quality = await testMode('QUALITY (Gemini Pro)', new GeminiProvider(), 30000);

  // ── AGENTIC MODE: Claude (basic response, no tools) ─────────────────────
  console.log('\nTesting ✨ AGENTIC mode (Claude Sonnet — no tools)...');
  results.agentic = await testMode('AGENTIC (Claude)', new ClaudeProvider(), 30000);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log('  Results Summary');
  console.log('═══════════════════════════════════════');

  let allPassed = true;
  for (const [mode, result] of Object.entries(results)) {
    const icon = result.ok ? '✅' : '❌';
    const status = result.ok ? 'PASS' : `FAIL${result.error ? ` — ${result.error}` : ''}`;
    console.log(`  ${icon} ${mode.toUpperCase().padEnd(10)} ${result.latencyMs}ms  ${status}`);
    if (!result.ok) allPassed = false;
  }

  console.log('\n' + (allPassed ? '✅ All modes passed!' : '⚠️  Some modes need attention'));
  console.log('═══════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
