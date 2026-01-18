import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Load environment variables from .env.local for local runs
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

type FeedbackEventRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  source: string;
  conversation_id: string | null;
  message_id: string | null;
  prompt_version: string | null;
  model: string | null;
  input: string | null;
  output: string | null;
  rating: number | null;
  feedback_text: string | null;
  labels: any;
  metadata: any;
  retrieval_context_ids: any;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function toJsonl(rows: any[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function parseArg(name: string, defaultValue?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return defaultValue;
  return process.argv[idx + 1] ?? defaultValue;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const outDir = parseArg("out", "datasets");

  // Phase-3 baseline defaults
  // - last 30 days
  // - require user
  // - include NULL ratings
  // - exclude empty input/output (handled in transformation stage)
  const sinceDays = Number.parseInt(parseArg("since-days", "30")!, 10);

  // Rating filters are optional; when not provided, we don't filter by rating.
  const minRatingStr = parseArg("min-rating");
  const maxRatingStr = parseArg("max-rating");

  const source = parseArg("source");
  const model = parseArg("model");
  const promptVersion = parseArg("prompt-version");

  // Default to require-user true for baseline datasets.
  const requireUserStr = parseArg("require-user", "true");

  // New option: include rows where rating IS NULL
  const includeNullRatingStr = parseArg("include-null-rating", "true");

  const minRating = minRatingStr != null ? Number(minRatingStr) : undefined;
  const maxRating = maxRatingStr != null ? Number(maxRatingStr) : undefined;
  const requireUser = requireUserStr === "true";
  const includeNullRating = includeNullRatingStr === "true";

  const sinceDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Query feedback events with coarse filters.
  // Note: Supabase-js filters are applied server-side.
  let q = supabaseAdmin
    .from("feedback_events")
    .select(
      "id, created_at, user_id, source, conversation_id, message_id, prompt_version, model, input, output, rating, feedback_text, labels, metadata, retrieval_context_ids"
    )
    .gte("created_at", sinceDate.toISOString());

  if (minRating != null) q = q.gte("rating", minRating);
  if (maxRating != null) q = q.lte("rating", maxRating);
  if (source) q = q.eq("source", source);
  if (model) q = q.eq("model", model);
  if (promptVersion) q = q.eq("prompt_version", promptVersion);
  if (requireUser) q = q.not("user_id", "is", null);

  // When includeNullRating=false, exclude NULL ratings explicitly.
  // When true, do nothing: NULL ratings remain eligible and will be curated if input/output are present.
  if (!includeNullRating) q = q.not("rating", "is", null);

  const { data, error } = await q;
  if (error) {
    console.error("Failed to query feedback_events:", error);
    process.exit(1);
  }

  const rows = (data ?? []) as FeedbackEventRow[];

  // Diagnostics to make "0 examples" self-explanatory.
  const diagnostics = rows.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.user_id != null) acc.withUser += 1;
      if (r.rating != null) acc.withRating += 1;
      if (isNonEmptyString(r.input)) acc.withInput += 1;
      if (isNonEmptyString(r.output)) acc.withOutput += 1;
      if (isNonEmptyString(r.input) && isNonEmptyString(r.output)) acc.withBoth += 1;
      return acc;
    },
    {
      total: 0,
      withUser: 0,
      withRating: 0,
      withInput: 0,
      withOutput: 0,
      withBoth: 0,
    }
  );

  // Transform into dataset examples.
  // Keep this format stable: it will be consumed by eval harness later.
  const examples = rows.flatMap((r) => {
    if (!isNonEmptyString(r.input) || !isNonEmptyString(r.output)) return [];

    const retrievalIds = Array.isArray(r.retrieval_context_ids) ? r.retrieval_context_ids : [];

    return [
      {
        id: r.id,
        createdAt: r.created_at,
        userId: r.user_id,
        source: r.source,
        conversationId: r.conversation_id,
        messageId: r.message_id,
        promptVersion: r.prompt_version,
        model: r.model,
        rating: r.rating,
        labels: r.labels ?? [],
        feedbackText: r.feedback_text,
        retrievalContextIds: retrievalIds,
        input: r.input.trim(),
        output: r.output.trim(),
        metadata: r.metadata ?? {},
      },
    ];
  });

  // Versioning: content hash + metadata
  const manifest = {
    generatedAt: new Date().toISOString(),
    filters: {
      sinceDays,
      minRating: minRating ?? null,
      maxRating: maxRating ?? null,
      source: source ?? null,
      model: model ?? null,
      promptVersion: promptVersion ?? null,
      requireUser,
      includeNullRating,
    },
    counts: {
      rowsFetched: rows.length,
      examples: examples.length,
    },
  };

  const versionHash = sha256(JSON.stringify(manifest) + "\n" + toJsonl(examples)).slice(0, 12);

  const versionedDir = path.join(outDir!, `feedback_dataset_${versionHash}`);
  ensureDir(versionedDir);

  const jsonlPath = path.join(versionedDir, "dataset.jsonl");
  const manifestPath = path.join(versionedDir, "manifest.json");

  fs.writeFileSync(jsonlPath, toJsonl(examples), "utf8");
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, versionHash }, null, 2), "utf8");

  console.log(`Wrote ${examples.length} examples to ${jsonlPath}`);
  console.log(`Wrote manifest to ${manifestPath}`);
  console.log(`Dataset version: ${versionHash}`);

  if (examples.length === 0) {
    console.warn("\n[Dataset Curation Diagnostics] 0 examples produced.");
    console.warn(`- rowsFetched: ${diagnostics.total}`);
    console.warn(`- requireUser: ${requireUser} (rows with user_id: ${diagnostics.withUser})`);
    console.warn(`- includeNullRating: ${includeNullRating} (rows with rating: ${diagnostics.withRating})`);
    console.warn(`- rows with non-empty input: ${diagnostics.withInput}`);
    console.warn(`- rows with non-empty output: ${diagnostics.withOutput}`);
    console.warn(`- rows with both input+output: ${diagnostics.withBoth}`);
    console.warn(
      "Hint: If rowsFetched > 0 but output/input are 0, ensure /api/feedback sends input/output, or relax filters (require-user/include-null-rating/min-rating/max-rating).\n"
    );
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
