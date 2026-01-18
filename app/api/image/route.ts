// app/api/image/route.ts
// (Optimized for asynchronous polling)

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { generateImage, ImageModel, getAvailableModels } from "@/lib/imageGeneration";

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
    const { userId } = auth();

    if (!userId) {
      console.warn("[IMAGE_API] Unauthorized access attempt.");
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const validation = requestSchema.safeParse(body);

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

    console.log(`[IMAGE_API] Generating ${amount} image(s) with model: ${model || 'default'}`);

    // Generate images using the unified service
    const results = await Promise.all(
      Array.from({ length: amount }, async () => {
        const result = await generateImage({
          prompt,
          aspectRatio,
          model: model as ImageModel | undefined,
        });
        return result;
      })
    );

    // Check if any generation failed
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
      throw new Error(failedResults[0].error || "Image generation failed");
    }

    // Extract URLs and model info
    const images = results.flatMap(r => r.urls);
    const usedModel = results[0].model;

    console.log(`[IMAGE_API] Successfully generated ${images.length} images with ${usedModel}`);

    return NextResponse.json({
      images,
      model: usedModel,
    });

  } catch (error: any) {
    console.error("[IMAGE_API_ERROR]", error);
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


