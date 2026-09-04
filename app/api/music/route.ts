// app/api/music/route.ts
// (Optimized for asynchronous polling — generation/debiting delegated to lib/media/music)

import { NextResponse } from "next/server";
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { musicGenerationSchema, ValidationError } from '@/lib/security/inputValidation';
import { createMusicPrediction, CreditInsufficientError } from "@/lib/media/music";

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

    // 4. Rate/Credit Check + generation (delegated to shared core for consistent
    //    deduction across both the route and the agent tool).
    const idempotencyKey = req.headers.get('idempotency-key') || `music-${user.userId}-${Date.now()}`;

    let prediction;
    try {
      const result = await createMusicPrediction(
        {
          prompt: input.prompt,
          duration: input.duration,
          model_version: (input as any).model_version,
          output_format: (input as any).output_format,
          normalization_strategy: (input as any).normalization_strategy,
        },
        user.userId,
        idempotencyKey
      );
      prediction = result.prediction;
    } catch (error: any) {
      if (error instanceof CreditInsufficientError) {
        return NextResponse.json(
          {
            error: 'Insufficient credits',
            message: error.message,
            remaining: error.remaining,
          },
          { status: 402 }
        );
      }
      throw error;
    }

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

























