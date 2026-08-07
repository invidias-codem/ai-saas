// app/api/image/route.ts
// (Optimized for asynchronous polling)

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { generateImage, ImageModel, getAvailableModels } from "@/lib/imageGeneration";
import { requireAuth, handleAuthError, getClientIP } from "@/lib/security/apiAuth";
import { limitApiEndpoint } from "@/lib/security/rateLimit";
import { imageGenerationSchema, ValidationError } from "@/lib/security/inputValidation";
import { checkCredits, deductCredits, spendCreditsAtomic, refundCredits, CREDIT_COSTS, ensureSufficientCreditsOrRespond } from "@/lib/credits";
import { trackAIGeneration, trackAIError, trackCreditsDeducted } from "@/lib/analytics/track";

// Define the allowed aspect ratios
const allowedAspectRatios = z.enum([
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
]);

// Define the input schema for our API
const requestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required."),
  amount: z.string().transform(s => parseInt(s, 10)).pipe(z.number().min(1).max(4)),
  resolution: allowedAspectRatios, // Corresponds to aspect_ratio
  model: z.enum(['flux-schnell', 'sdxl', 'playground-v2.5']).optional(),
});

export async function POST(req: Request) {
  try {
    // 1. Authentication
    const user = await requireAuth();
    const ip = getClientIP(req);

    // 2. Rate Limiting (Image generation - very expensive, strict limits)
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'ai');
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests', message: 'Image generation rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)),
            'X-RateLimit-Remaining': String(rateLimit.remaining)
          }
        }
      );
    }

    // 3. Parse and Validate Input
    const body = await req.json();
    const validation = imageGenerationSchema.safeParse(body);

    if (!validation.success) {
      console.warn("Invalid request body for /api/image:", validation.error.flatten());
      return new NextResponse(JSON.stringify({
        error: "Invalid input.",
        details: validation.error.flatten().fieldErrors
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { prompt, amount, resolution: aspectRatio, model } = validation.data;

    const cost = CREDIT_COSTS.IMAGE_GENERATION;
    const totalCost = amount * cost;
    const idempotencyKey = req.headers.get('idempotency-key') || `image-${user.userId}-${Date.now()}`;

    const insufficient = await ensureSufficientCreditsOrRespond(user.userId, totalCost);
    if (!insufficient.allowed && insufficient.response) {
        return insufficient.response;
    }

    const spendResult = await spendCreditsAtomic(user.userId, totalCost, idempotencyKey, `Generated ${amount} images`);
    if (!spendResult.success && !spendResult.duplicate) {
        return NextResponse.json(
            { error: 'Insufficient credits', message: `You need ${totalCost} credits for this request.`, remaining: spendResult.remaining, topUpUrl: '/settings#credits' },
            { status: 402 }
        );
    }

    console.log(`[IMAGE_API] Generating ${amount} image(s) with model: ${model || 'default'}`);

    // Generate images using the unified service
    let results;
    try {
      results = await Promise.all(
        Array.from({ length: amount }, async () => {
          const result = await generateImage({
            prompt,
            aspectRatio,
            model: model as ImageModel | undefined,
          });
          return result;
        })
      );
    } catch (error) {
      if (!spendResult.duplicate) {
        console.log(`[IMAGE_API] Generation failed, refunding ${totalCost} credits`);
        await refundCredits(user.userId, totalCost, "Refund for failed image generation");
      }
      throw error;
    }

    // Check if any generation failed
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
      // If mixed failure/success, we ideally refund partial. 
      // Current logic throws on ANY failure.
      if (!spendResult.duplicate) {
        console.log(`[IMAGE_API] Generation failed (partial/full), refunding ${totalCost} credits`);
        await refundCredits(user.userId, totalCost, "Refund for failed image generation");
      }
      throw new Error(failedResults[0].error || "Image generation failed");
    }

    // Deduct credits handled atomically upfront
    // await deductCredits(user.userId, totalCost, `Generated ${amount} images`);

    // Extract URLs and rewrite to stable proxy URLs (Replicate CDN links expire)
    const rawImages = results.flatMap(r => r.urls);
    const images = rawImages.map(url =>
      `/api/image-proxy?url=${encodeURIComponent(url)}`
    );
    const usedModel = results[0].model;

    console.log(`[IMAGE_API] Successfully generated ${images.length} images with ${usedModel}`);

    void trackAIGeneration({ tool: 'image', model: usedModel, userId: user.userId, success: true });
    void trackCreditsDeducted({ tool: 'image', credits: totalCost, userId: user.userId });
    return NextResponse.json({
      images,
      model: usedModel,
    });

  } catch (error: any) {
    console.error("[IMAGE_API_ERROR]", error);

    // Handle auth/validation errors
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    if (error instanceof ValidationError) {
      return NextResponse.json({
        error: 'Validation Error',
        details: error.message
      }, { status: 400 });
    }

    const errorMessage = error.message || "An unknown error occurred";
    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      details: errorMessage
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// GET endpoint to fetch available models
export async function GET() {
  try {
    const models = getAvailableModels();
    return NextResponse.json({ models });
  } catch (error: any) {
    console.error("[IMAGE_API_ERROR]", error);
    return new NextResponse(JSON.stringify({
      error: "Failed to fetch models"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}


