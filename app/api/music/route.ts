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

    console.log(`Sending request to Replicate MusicGen model with input:`, input);

    // 6. Call Replicate's create prediction API (asynchronous)
    const prediction = await replicate.predictions.create({
      version: MUSICGEN_VERSION,
      input: input,
    });

    console.log("Replicate job started. Sending prediction object to client:", prediction.id);

    // 7. Return the initial prediction object
    return NextResponse.json(prediction);

  } catch (error: any) {
    console.error(`[MUSIC_API_ERROR] Prompt: "${prompt || 'N/A'}" | Error:`, error);

    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    if (error instanceof ValidationError) {
      return NextResponse.json({ error: 'Validation Error', details: error.message }, { status: 400 });
    }

    const details = error.message || "An unknown error occurred";

    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      details: details
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

























