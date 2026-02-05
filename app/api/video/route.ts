// app/api/video/route.ts 
// (Optimized for asynchronous polling)

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { env } from '@/lib/env'; // Your environment variables
import Replicate from 'replicate'; // Import the Replicate library
import { z } from 'zod'; // For input validation
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { videoGenerationSchema, ValidationError } from '@/lib/security/inputValidation';

// Initialize the Replicate client using the API token from your environment
const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN_VIDEO,
});

// Model identifier
const VEO_MODEL = "google/veo-3-fast";

const requestSchema = z.object({
  prompt: z.string().min(1, { message: "Prompt is required." }),
  aspect_ratio: z.string().optional(),
  duration: z.coerce.number().int().positive().optional(),
  image: z.string().url().optional(),
  negative_prompt: z.string().optional(),
  resolution: z.string().optional(),
  generate_audio: z.boolean().optional(),
  seed: z.number().int().optional(),
});

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
    console.log(`Starting Replicate prediction for ${VEO_MODEL} with input:`, input);

    // 3. ✅ Call Replicate's create prediction API (asynchronous)
    // This starts the job and returns immediately
    const prediction = await replicate.predictions.create({
      model: VEO_MODEL,
      input: input,
      // You could also add a webhook URL here to be notified on completion
      // webhook: `${env.VERCEL_URL}/api/webhooks/replicate`
      // webhook_events_filter: ["completed"]
    });

    console.log("Replicate job started. Sending prediction object to client:", prediction.id);

    // 4. ✅ Return the initial prediction object to the client
    // The client will use this object (especially prediction.id) to poll for status.
    return NextResponse.json(prediction);

  } catch (error: any) {
    console.error('[REPLICATE_VIDEO_API_ERROR]', error);

    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    if (error instanceof ValidationError) {
      return NextResponse.json({ error: 'Validation Error', details: error.message }, { status: 400 });
    }

    const details = error.message || "Failed to start video generation via Replicate.";
    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      details: details
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}