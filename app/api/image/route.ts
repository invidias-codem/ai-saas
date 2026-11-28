// app/api/image/route.ts
// (Optimized for asynchronous polling)

import { NextResponse } from "next/server";
import { ImageModel, getAvailableModels } from "@/lib/imageGeneration";
import { requireAuth, handleAuthError, getClientIP } from "@/lib/security/apiAuth";
import { limitApiEndpoint } from "@/lib/security/rateLimit";
import { imageGenerationSchema, ValidationError } from "@/lib/security/inputValidation";
import { createImagePrediction, ImageCreditInsufficientError } from "@/lib/media/image";

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

    const idempotencyKey = req.headers.get('idempotency-key') || `image-${user.userId}-${Date.now()}`;

    let result;
    try {
      result = await createImagePrediction(
        {
          prompt,
          amount,
          aspectRatio,
          model: model as ImageModel,
        },
        user.userId,
        idempotencyKey
      );
    } catch (error: any) {
      if (error instanceof ImageCreditInsufficientError) {
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

    return NextResponse.json({
      images: result.images,
      model: result.model,
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


