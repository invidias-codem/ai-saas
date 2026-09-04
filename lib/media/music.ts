// lib/media/music.ts
// Shared music-generation core: Replicate submission + atomic credit deduction.
// Consumed by BOTH the /api/music route and the generate_music agent tool so
// credit accounting stays consistent regardless of the entry point.
import Replicate from "replicate";
import { env } from "@/lib/env";
import {
  spendCreditsAtomic,
  refundCredits,
  CREDIT_COSTS,
} from "@/lib/credits";
import { trackAIGeneration, trackCreditsDeducted } from "@/lib/analytics/track";

const MUSICGEN_VERSION =
  "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";

const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN_MUSIC,
});

export interface MusicPredictionInput {
  prompt: string;
  duration?: number;
  model_version?: string;
  output_format?: "mp3" | "wav";
  normalization_strategy?: "peak" | "loudness" | "clip";
}

export interface MusicPredictionResult {
  predictionId: string;
  status: string;
  pollUrl: string;
  /** Full Replicate prediction object — preserved for the /api/music response contract. */
  prediction: any;
}

/**
 * Deduct credits atomically (idempotent), submit to Replicate MusicGen, and
 * return the prediction metadata. Refunds on a failed submission (unless the
 * spend was a duplicate).
 */
export async function createMusicPrediction(
  input: MusicPredictionInput,
  userId: string,
  idempotencyKey: string | null
): Promise<MusicPredictionResult> {
  const cost = CREDIT_COSTS.MUSIC_GENERATION;

  const spendResult = await spendCreditsAtomic(userId, cost, idempotencyKey, "Music generation");

  if (!spendResult.success && !spendResult.duplicate) {
    throw new CreditInsufficientError(
      `You need ${cost} credits for this request.`,
      spendResult.remaining
    );
  }

  let prediction;
  try {
    prediction = await replicate.predictions.create({
      version: MUSICGEN_VERSION,
      input: {
        prompt: input.prompt,
        duration: input.duration ?? 8,
        model_version: input.model_version ?? "stereo-large",
        output_format: input.output_format ?? "mp3",
        normalization_strategy: input.normalization_strategy ?? "peak",
      },
    });
  } catch (error) {
    if (!spendResult.duplicate) {
      await refundCredits(userId, cost, "Refund for failed music generation start");
    }
    throw error;
  }

  void trackAIGeneration({ tool: "music", model: "replicate", userId, success: true });
  void trackCreditsDeducted({ tool: "music", credits: cost, userId });

  return {
    predictionId: prediction.id,
    status: prediction.status,
    pollUrl: `/api/music/predictions/${prediction.id}`,
    prediction,
  };
}

/** Thrown when the user lacks sufficient credits for a music generation. */
export class CreditInsufficientError extends Error {
  constructor(message: string, public remaining: number) {
    super(message);
    this.name = "CreditInsufficientError";
  }
}