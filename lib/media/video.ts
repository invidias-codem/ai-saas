// lib/media/video.ts
// Shared video-generation core: atomic credit deduction + Replicate Veo 3 submission.
// Consumed by BOTH the /api/video route and the generate_video agent tool.
import { createHash, randomUUID } from 'node:crypto';
import { env } from "@/lib/env";
import {
  spendCreditsAtomic,
  refundCredits,
  CREDIT_COSTS,
} from "@/lib/credits";
import { trackAIGeneration, trackCreditsDeducted } from "@/lib/analytics/track";
import { videoProvider } from './videoProvider';
import { reserveVideoJob, attachVideoPrediction, failVideoJob, toVideoPrediction } from './videoStore';
import { dispatchVideoCompletion } from './videoDispatch';
import type { ReplicatePrediction } from '@/components/media/types';

const VEO_MODEL = "google/veo-3-fast";


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
  /** Compatible public prediction shape with owner-scoped application URLs. */
  prediction: ReplicatePrediction;
}

export class VideoCreditInsufficientError extends Error {
  constructor(message: string, public remaining: number) {
    super(message);
    this.name = "VideoCreditInsufficientError";
  }
}

export class VideoRequestInProgressError extends Error {}

/**
 * Deduct credits atomically (idempotent) and submit an asynchronous Veo 3
 * prediction. Refunds on a failed submission (unless a duplicate).
 */
export async function createVideoPrediction(
  input: VideoGenerationInput,
  userId: string,
  idempotencyKey: string | null
): Promise<VideoPredictionResult> {
  // Fail before charging if durable delivery has not been activated.
  const replicate = videoProvider();
  if (!env.TRIGGER_SECRET_KEY) throw new Error('Video completion worker is not configured');
  const cost = CREDIT_COSTS.VIDEO_GENERATION;

  const replicateInput: Record<string, unknown> = {
    prompt: input.prompt,
  };
  if (input.aspectRatio) replicateInput.aspect_ratio = input.aspectRatio;
  if (input.duration) replicateInput.duration = input.duration;
  if (input.resolution) replicateInput.resolution = input.resolution;

  const operationKey = idempotencyKey || randomUUID();
  const inputHash = createHash('sha256').update(JSON.stringify(replicateInput)).digest('hex');
  const reservation = await reserveVideoJob(userId, operationKey, inputHash);
  if (!reservation.created) {
    if (!reservation.job.prediction_id) {
      throw new VideoRequestInProgressError('This video request was already submitted. Do not resubmit it with a new key.');
    }
    const prediction = toVideoPrediction(reservation.job);
    if (!['succeeded', 'failed', 'canceled'].includes(reservation.job.status)) {
      await dispatchVideoCompletion(reservation.job);
    }
    return { predictionId: prediction.id, status: prediction.status,
      pollUrl: `/api/video/predictions/${prediction.id}`, prediction };
  }

  let spendResult;
  try {
    spendResult = await spendCreditsAtomic(userId, cost, operationKey, 'Video generation');
  } catch (error) {
    await failVideoJob(reservation.job, 'Unable to authorize video credits.');
    throw error;
  }
  if (!spendResult.success && !spendResult.duplicate) {
    await failVideoJob(reservation.job, `You need ${cost} credits for this request.`);
    throw new VideoCreditInsufficientError(`You need ${cost} credits for this request.`, spendResult.remaining);
  }
  if (spendResult.duplicate) {
    await failVideoJob(reservation.job, 'This credit request was previously used.');
    throw new VideoRequestInProgressError('This credit request was previously used.');
  }

  let prediction;
  try {
    prediction = await replicate.predictions.create({
      model: VEO_MODEL,
      input: replicateInput,
    });
  } catch (error) {
    try {
      await refundCredits(userId, cost, 'Refund for failed video generation start');
    } finally {
      await failVideoJob(reservation.job, 'Unable to start video generation.');
    }
    throw error;
  }

  // A successful submission is never refunded on a later persistence failure.
  let job;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      job = await attachVideoPrediction(reservation.job, prediction.id);
      break;
    } catch (error) {
      if (attempt === 2) {
        // Operator reconciliation for the provider-accepted/DB-unavailable gap.
        console.error('[VIDEO_PREDICTION_RECORD_FAILED]', { jobId: reservation.job.id, predictionId: prediction.id });
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  if (!job) throw new Error('Video prediction could not be recorded');
  await dispatchVideoCompletion(job);

  void trackAIGeneration({ tool: "video", model: "veo-3-fast", userId, success: true });
  void trackCreditsDeducted({ tool: "video", credits: cost, userId });

  return {
    predictionId: prediction.id,
    status: prediction.status,
    pollUrl: `/api/video/predictions/${prediction.id}`,
    prediction: toVideoPrediction(job),
  };
}
