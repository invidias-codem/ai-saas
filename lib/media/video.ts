// lib/media/video.ts
// Shared video-generation core: atomic credit deduction + Replicate Veo 3 submission.
// Consumed by BOTH the /api/video route and the generate_video agent tool.
import Replicate from "replicate";
import { env } from "@/lib/env";
import {
  spendCreditsAtomic,
  refundCredits,
  CREDIT_COSTS,
} from "@/lib/credits";
import { trackAIGeneration, trackCreditsDeducted } from "@/lib/analytics/track";

const VEO_MODEL = "google/veo-3-fast";

const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN_VIDEO,
});

export interface VideoGenerationInput {
  prompt: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  [key: string]: unknown;
}

export interface VideoPredictionResult {
  predictionId: string;
  status: string;
  pollUrl: string;
  /** Full Replicate prediction object — preserved for the /api/video response contract. */
  prediction: any;
}

export class VideoCreditInsufficientError extends Error {
  constructor(message: string, public remaining: number) {
    super(message);
    this.name = "VideoCreditInsufficientError";
  }
}

/**
 * Deduct credits atomically (idempotent) and submit an asynchronous Veo 3
 * prediction. Refunds on a failed submission (unless a duplicate).
 */
export async function createVideoPrediction(
  input: VideoGenerationInput,
  userId: string,
  idempotencyKey: string | null
): Promise<VideoPredictionResult> {
  const cost = CREDIT_COSTS.VIDEO_GENERATION;

  const spendResult = await spendCreditsAtomic(userId, cost, idempotencyKey, "Video generation");

  if (!spendResult.success && !spendResult.duplicate) {
    throw new VideoCreditInsufficientError(
      `You need ${cost} credits for this request.`,
      spendResult.remaining
    );
  }

  const replicateInput: Record<string, unknown> = {
    prompt: input.prompt,
  };
  if (input.aspectRatio) replicateInput.aspect_ratio = input.aspectRatio;
  if (input.duration) replicateInput.duration = input.duration;
  if (input.resolution) replicateInput.resolution = input.resolution;

  let prediction;
  try {
    prediction = await replicate.predictions.create({
      model: VEO_MODEL,
      input: replicateInput,
    });
  } catch (error) {
    if (!spendResult.duplicate) {
      await refundCredits(userId, cost, "Refund for failed video generation start");
    }
    throw error;
  }

  void trackAIGeneration({ tool: "video", model: "veo-3-fast", userId, success: true });
  void trackCreditsDeducted({ tool: "video", credits: cost, userId });

  return {
    predictionId: prediction.id,
    status: prediction.status,
    pollUrl: `/api/video/predictions/${prediction.id}`,
    prediction,
  };
}