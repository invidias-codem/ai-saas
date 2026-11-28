// lib/media/image.ts
// Shared image-generation core: atomic credit deduction + the unified generateImage
// service. Consumed by BOTH the /api/image route and the generate_image agent tool
// so credit accounting stays consistent regardless of entry point.
import { generateImage, ImageModel } from "@/lib/imageGeneration";
import {
  spendCreditsAtomic,
  refundCredits,
  CREDIT_COSTS,
} from "@/lib/credits";
import { trackAIGeneration, trackCreditsDeducted } from "@/lib/analytics/track";

export interface ImageGenerationInput {
  prompt: string;
  amount: number;
  aspectRatio: string;
  model?: ImageModel;
}

export interface ImageGenerationOutput {
  /** Proxy-stable image URLs (Replicate CDN links expire). */
  images: string[];
  model: ImageModel;
}

/** Thrown when the user lacks sufficient credits for an image generation. */
export class ImageCreditInsufficientError extends Error {
  constructor(message: string, public remaining: number) {
    super(message);
    this.name = "ImageCreditInsufficientError";
  }
}

/**
 * Deduct credits atomically for `amount` images and generate them synchronously
 * via the unified `generateImage` service (with model fallback). Refunds the
 * full amount on failure (unless the spend was a duplicate).
 */
export async function createImagePrediction(
  input: ImageGenerationInput,
  userId: string,
  idempotencyKey: string | null
): Promise<ImageGenerationOutput> {
  const cost = CREDIT_COSTS.IMAGE_GENERATION;
  const totalCost = input.amount * cost;

  const spendResult = await spendCreditsAtomic(
    userId,
    totalCost,
    idempotencyKey,
    `Generated ${input.amount} images`
  );

  if (!spendResult.success && !spendResult.duplicate) {
    throw new ImageCreditInsufficientError(
      `You need ${totalCost} credits for this request.`,
      spendResult.remaining
    );
  }

  let results;
  try {
    results = await Promise.all(
      Array.from({ length: input.amount }, async () => {
        return generateImage({
          prompt: input.prompt,
          aspectRatio: input.aspectRatio as any,
          model: input.model,
        });
      })
    );
  } catch (error) {
    if (!spendResult.duplicate) {
      await refundCredits(userId, totalCost, "Refund for failed image generation");
    }
    throw error;
  }

  const failedResults = results.filter((r) => !r.success);
  if (failedResults.length > 0) {
    if (!spendResult.duplicate) {
      await refundCredits(userId, totalCost, "Refund for failed image generation");
    }
    throw new Error(failedResults[0].error || "Image generation failed");
  }

  // Extract URLs and rewrite to stable proxy URLs.
  const rawImages = results.flatMap((r) => r.urls);
  const images = rawImages.map((url) => `/api/image-proxy?url=${encodeURIComponent(url)}`);
  const usedModel = results[0].model;

  void trackAIGeneration({ tool: "image", model: usedModel, userId, success: true });
  void trackCreditsDeducted({ tool: "image", credits: totalCost, userId });

  return { images, model: usedModel };
}