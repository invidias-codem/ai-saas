// app/api/video/route.ts 
// (Optimized for asynchronous polling — generation/debiting delegated to lib/media/video)

import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { videoGenerationSchema, ValidationError } from '@/lib/security/inputValidation';
import { createVideoPrediction, VideoCreditInsufficientError } from "@/lib/media/video";

export async function POST(request: Request) {
  try {
    // 1. Authentication
    const user = await requireAuth();
    const ip = getClientIP(request);

    // 2. Rate Limiting (Video generation - VERY expensive, very strict limits)
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'ai');
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests', message: 'Video generation rate limit exceeded' },
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
    const body = await request.json();
    const validation = videoGenerationSchema.safeParse(body);

    if (!validation.success) {
      console.warn("Invalid request body for /api/video:", validation.error.flatten());
      return new NextResponse(JSON.stringify({
        error: "Invalid input.",
        details: validation.error.flatten().fieldErrors
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const input = validation.data;

    // 4. Rate/Credit Check + generation (delegated to shared core).
    const idempotencyKey = request.headers.get('idempotency-key') || `video-${user.userId}-${Date.now()}`;

    let prediction;
    try {
      const result = await createVideoPrediction(
        {
          prompt: input.prompt,
          aspectRatio: (input as any).aspect_ratio || (input as any).aspectRatio,
          duration: (input as any).duration,
          resolution: (input as any).resolution,
        },
        user.userId,
        idempotencyKey
      );
      prediction = result.prediction;
    } catch (error: any) {
      if (error instanceof VideoCreditInsufficientError) {
        return NextResponse.json(
          {
            error: 'Insufficient credits',
            message: error.message,
            remaining: error.remaining,
            topUpUrl: '/settings#credits',
          },
          { status: 402 }
        );
      }
      throw error;
    }

    console.log("Replicate job started. Sending prediction object to client:", prediction.id);

    // 4. Return the initial prediction object (client polls via prediction.id)
    return NextResponse.json(prediction);

  } catch (error: any) {
    console.error('[REPLICATE_VIDEO_API_ERROR]', error);

    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    if (error instanceof ValidationError) {
      return NextResponse.json({ error: 'Validation Error', details: error.message }, { status: 400 });
    }

    const details = process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : (error.message || "Failed to start video generation via Replicate.");
    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      details: details
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}