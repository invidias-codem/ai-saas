#!/usr/bin/env node
/**
 * scripts/train-jepa-from-queue.mjs
 *
 * Offline MBRL worker for JEPA predictor refinement.
 *
 * Pulls pending tuples from `jepa_training_queue`, re-encodes ASTs through
 * the JEPA predictor, computes prediction loss, and writes training signals
 * back to Supabase for downstream weight update.
 *
 * This is intended to run outside Vercel: CI, local workstation, or dedicated
 * worker host. It does not use the Next.js runtime.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { serializeAstForJepa } from '../lib/jepa/astEncoderInput.js';
import { JepaDivergenceScorer } from '../lib/ucol/mcts/codeSearchMcts.js';

const BATCH_SIZE = Number(process.env.JEPA_TRAIN_BATCH_SIZE ?? '16');
const MAX_RUNTIME_MS = Number(process.env.JEPA_TRAIN_MAX_RUNTIME_MS ?? '10 * 60 * 1000'); // 10m default
const VERCEL_JEPA_BYPASS_HEADER = process.env.VERCEL_JEPA_BYPASS_HEADER ?? process.env.JEPA_TRAIN_BYPASS_HEADER;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const jepaEndpoint = process.env.JEPA_TRAIN_ENDPOINT || 'http://localhost:3000/api/jepa/infer';
  const scorer = new JepaDivergenceScorer({ jepaEndpoint });

  const startedAt = Date.now();
  let processed = 0;

  while (Date.now() - startedAt < MAX_RUNTIME_MS) {
    const { data: rows, error: fetchError } = await supabase
      .from('jepa_training_queue')
      .select('id, initial_state, action, resulting_state, divergence')
      .eq('status', 'pending')
      .order('divergence', { ascending: false })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[jepa-train] fetch failed:', fetchError.message);
      process.exitCode = 1;
      break;
    }

    if (!rows || rows.length === 0) {
      console.log('[jepa-train] queue empty; exiting.');
      break;
    }

    for (const row of rows) {
      const trainingId = row.id;
      const initialState = row.initial_state;
      const action = row.action;
      const resultingState = row.resulting_state;

      let predictedEmbedding = null;
      let loss = null;

      try {
        const initialDetail = String(initialState.detail ?? '');
        const astTokens = initialDetail ? serializeAstForJepa(initialDetail) : [];
        const language = String(initialState.circuitState ?? 'typescript');

        const { embedding } = await scorer.score({
          id: trainingId,
          content: initialDetail,
          language,
          astTokens,
          type: 'file',
          path: 'training://jepa-queue',
          startLine: 1,
          endLine: 1,
          workspaceId: 'offline-train',
        } as any);

        predictedEmbedding = embedding;

        const targetVector = resultingState.targetVector ?? null;
        if (targetVector && embedding) {
          loss = computeMse(embedding, targetVector);
        }
      } catch (err) {
        console.error(`[jepa-train] score failed for ${trainingId}:`, err.message);
      }

      const { error: updateError } = await supabase
        .from('jepa_training_queue')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          metadata: {
            loss,
            predictedEmbedding,
            jepaEndpoint,
            processedAt: new Date().toISOString(),
          },
        })
        .eq('id', trainingId);

      if (updateError) {
        console.error(`[jepa-train] update failed for ${trainingId}:`, updateError.message);
      }

      processed++;
    }

    console.log(`[jepa-train] processed=${rows.length} total=${processed}`);
  }

  console.log(`[jepa-train] finished processed=${processed} runtimeMs=${Date.now() - startedAt}`);
}

function computeMse(predicted, target) {
  if (!Array.isArray(predicted) || !Array.isArray(target) || predicted.length !== target.length) {
    return null;
  }

  let sumSq = 0;
  for (let i = 0; i < predicted.length; i++) {
    const d = predicted[i] - target[i];
    sumSq += d * d;
  }
  return sumSq / predicted.length;
}

main().catch((err) => {
  console.error('[jepa-train] fatal:', err);
  process.exit(1);
});
