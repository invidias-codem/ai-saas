// app/api/music/route.ts
// (Optimized for asynchronous polling - FIX)

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import Replicate from "replicate";
import { z } from "zod";
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { musicGenerationSchema, ValidationError } from '@/lib/security/inputValidation';
import { checkCredits, deductCredits, spendCreditsAtomic, refundCredits, CREDIT_COSTS } from "@/lib/credits";
import { trackAIGeneration, trackAIError, trackCreditsDeducted } from "@/lib/analytics/track";

// 1. Initialize Replicate client
const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN_MUSIC,
});

// 2. Define the input schema
const requestSchema = z.object({
  prompt: z.string().min(1, { message: "Prompt cannot be empty." }),
  model_version: z.string().optional().default("stereo-large"),
  output_format: z.enum(["mp3", "wav"]).optional().default("mp3"),
  normalization_strategy: z.enum(["peak", "loudness", "clip"]).optional().default("peak"),
  duration: z.coerce.number().int().positive().optional().default(8),
});

// 3. Define the Replicate Model Identifier
const MUSICGEN_VERSION = "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";

export async function POST(req: Request) {
  let prompt: string | undefined = undefined;

  try {
    // 1. Authentication
    const user = await requireAuth();
    const ip = getClientIP(req);

    // 2. Rate Limiting (Music generation - expensive, strict limits)
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'ai');
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests', message: 'Music generation rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)),
            'X-RateLimit-Remaining': String(rateLimit.remaining)
          }
        }
      );
    }

    // 3. Input Validation
    const body = await req.json();
    const validation = musicGenerationSchema.safeParse(body);

    if (!validation.success) {
      console.warn("Invalid request body for /api/music:", validation.error.flatten());
      return new NextResponse(JSON.stringify({
        error: "Invalid input.",
        details: validation.error.flatten().fieldErrors
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const input = validation.data;
    // ✅ Assign prompt value after successful validation
    prompt = input.prompt;

    // 4. Rate/Credit Check (Atomic)
    const cost = CREDIT_COSTS.MUSIC_GENERATION;
    const idempotencyKey = req.headers.get('idempotency-key') || `music-${user.userId}-${Date.now()}`;

    const spendResult = await spendCreditsAtomic(user.userId, cost, idempotencyKey, "Music generation");

    if (!spendResult.success && !spendResult.duplicate) {
      return NextResponse.json(
        { error: 'Insufficient credits', message: `You need ${cost} credits for this request.`, remaining: spendResult.remaining },
        { status: 402 }
      );
    }

    console.log(`Sending request to Replicate MusicGen model with input:`, input);

    // 6. Call Replicate's create prediction API (asynchronous)
    let prediction;
    try {
      prediction = await replicate.predictions.create({
        version: MUSICGEN_VERSION,
        input: input,
      });
    } catch (error) {
      if (!spendResult.duplicate) {
        await refundCredits(user.userId, cost, "Refund for failed music generation start");
      }
      throw error;
    }

    // Deduct credits handled atomically upfront
    // await deductCredits(user.userId, cost, "Music generation");

    console.log("Replicate job started. Sending prediction object to client:", prediction.id);

    // 7. Return the initial prediction object
    void trackAIGeneration({ tool: 'music', model: 'replicate', userId: user.userId, success: true });
    void trackCreditsDeducted({ tool: 'music', credits: cost, userId: user.userId });
    return NextResponse.json(prediction);

  } catch (error: any) {
    console.error(`[MUSIC_API_ERROR] Prompt: "${prompt || 'N/A'}" | Error:`, error);

    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    if (error instanceof ValidationError) {
      return NextResponse.json({ error: 'Validation Error', details: error.message }, { status: 400 });
    }

    const details = process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : (error.message || "An unknown error occurred");

    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      details: details
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

























