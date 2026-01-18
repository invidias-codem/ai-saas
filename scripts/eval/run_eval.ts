import dotenv from "dotenv";
import path from "path";

// Load env from .env.local for local runs (CI will provide env vars)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import fs from "fs";
import readline from "readline";
import crypto from "crypto";

import { generateConversationReply, ConversationRequestSchema } from "@/lib/llm/conversationEngine";

type DatasetExample = {
  id: string;
  createdAt?: string;
  userId?: string | null;
  source?: string;
  conversationId?: string | null;
  messageId?: string | null;
  promptVersion?: string | null;
  model?: string | null;
  rating?: number | null;
  labels?: string[];
  feedbackText?: string | null;
  retrievalContextIds?: string[];
  input: string;
  output: string;
  metadata?: Record<string, unknown>;
};

type EvalItemResult = {
  id: string;
  input: string;
  expected: string;
  candidate: string;
  pass: boolean;
  notes?: string[];
};

type EvalReport = {
  generatedAt: string;
  datasetPath: string;
  runId: string;
  model: string;
  options: {
    disableSideEffects: boolean;
    disableExternalContext: boolean;
  };
  counts: {
    total: number;
    passed: number;
    failed: number;
  };
  results: EvalItemResult[];
};

function parseArg(name: string, defaultValue?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return defaultValue;
  return process.argv[idx + 1] ?? defaultValue;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function simpleSimilarityPass(expected: string, candidate: string): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  const e = expected.trim();
  const c = candidate.trim();

  if (!c) return { pass: false, notes: ["Empty candidate output"] };

  // Extremely simple heuristics for now:
  // - Candidate should not contain obvious refusal unless expected does.
  const refusal = /(i\s+can\'?t|i\s+cannot|i\s+won\'?t|as\s+an\s+ai|i\s+don\'?t\s+have\s+access)/i;
  if (!refusal.test(e) && refusal.test(c)) {
    notes.push("Candidate looks like a refusal while expected is not");
  }

  const pass = notes.length === 0;
  return { pass, notes };
}

async function readJsonl(filePath: string): Promise<DatasetExample[]> {
  const input = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const rows: DatasetExample[] = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

async function main() {
  const datasetPath = parseArg("dataset");
  const outDir = parseArg("out", "eval") ?? "eval";
  const modelOverride = parseArg("model", "gemini-2.0-flash") ?? "gemini-2.0-flash";

  const disableSideEffects = parseArg("disable-side-effects", "true") === "true";
  const disableExternalContext = parseArg("disable-external-context", "true") === "true";

  if (!datasetPath) {
    console.error("Missing --dataset path to dataset.jsonl");
    process.exit(1);
  }

  ensureDir(outDir);

  const examples = await readJsonl(datasetPath);
  const runId = sha256(`${new Date().toISOString()}|${datasetPath}|${modelOverride}`).slice(0, 12);

  const userId = process.env.EVAL_USER_ID ?? "eval_user";
  const clerkUser = { id: userId, emailAddresses: [], firstName: "Eval", lastName: "User" };

  const results: EvalItemResult[] = [];

  for (const ex of examples) {
    const request = ConversationRequestSchema.parse({
      messages: [{ role: "user", text: ex.input }],
    });

    const reply = await generateConversationReply(
      { userId, clerkUser, request },
      {
        disableSideEffects,
        disableExternalContext,
        model: modelOverride,
      }
    );

    const score = simpleSimilarityPass(ex.output, reply.text);

    results.push({
      id: ex.id,
      input: ex.input,
      expected: ex.output,
      candidate: reply.text,
      pass: score.pass,
      notes: score.notes.length ? score.notes : undefined,
    });
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    datasetPath,
    runId,
    model: modelOverride,
    options: {
      disableSideEffects,
      disableExternalContext,
    },
    counts: {
      total: results.length,
      passed,
      failed,
    },
    results,
  };

  const reportPath = path.join(outDir, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  const summary = `# Eval Summary\n\n- Dataset: ${datasetPath}\n- Run: ${runId}\n- Model: ${modelOverride}\n- Total: ${results.length}\n- Passed: ${passed}\n- Failed: ${failed}\n\n`;
  fs.writeFileSync(path.join(outDir, "summary.md"), summary, "utf8");

  console.log(`Wrote eval report to ${reportPath}`);
}

main().catch((err) => {
  console.error("Eval run failed:", err);
  process.exit(1);
});
