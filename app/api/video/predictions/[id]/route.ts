// app/api/video/predictions/[id]/route.ts

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { env } from '@/lib/env'; // Your environment variables
import Replicate from 'replicate'; // Import the Replicate library

// Initialize the Replicate client
const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN,
});

/**
 * GET handler to fetch the status of a specific Replicate prediction.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Clerk Authentication (optional but recommended)
    // You should secure this endpoint to prevent others from polling your job statuses.
    const { userId } = auth();
    if (!userId) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Get predictionId from the URL
    const predictionId = params.id;
    if (!predictionId) {
      return new NextResponse(JSON.stringify({ error: "Prediction ID is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Call Replicate to get the prediction status
    const prediction = await replicate.predictions.get(predictionId);

    // 4. Return the full prediction object
    // The client can inspect prediction.status ("starting", "processing", "succeeded", "failed")
    // and prediction.output (if succeeded)
    return NextResponse.json(prediction);

  } catch (error: any) {
    console.error('[REPLICATE_GET_PREDICTION_ERROR]', error);
    const details = error.message || "Failed to fetch prediction status.";
    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      details: details
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}