// app/api/image/route.ts
// (Optimized for asynchronous polling)

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import Replicate from "replicate";
import { z } from "zod";

// Initialize Replicate client
const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN,
});

// Model identifier for nano-banana
const NANO_BANANA_MODEL = "google/nano-banana";

// Define the allowed aspect ratios for the nano-banana model
const allowedAspectRatios = z.enum([
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "match_input_image"
]);

// Define the input schema for our API
const requestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required."),
  amount: z.string().transform(s => parseInt(s, 10)).pipe(z.number().min(1).max(4)),
  resolution: allowedAspectRatios, // Corresponds to aspect_ratio
});

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
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

    const { prompt, amount, resolution: aspect_ratio } = validation.data;

    // Prepare input for the nano-banana model
    const input = {
      prompt: prompt,
      aspect_ratio: aspect_ratio,
      output_format: "jpg", // Specify output format
    };
    
    console.log(`Starting ${amount} Replicate prediction(s) for ${NANO_BANANA_MODEL} with input:`, input);

    // Since nano-banana generates one image per prediction, we create multiple predictions.
    const predictionPromises = Array.from({ length: amount }, () => 
      replicate.predictions.create({
        model: NANO_BANANA_MODEL,
        input: input,
      })
    );

    const predictions = await Promise.all(predictionPromises);

    console.log(`Replicate jobs started. Sending ${predictions.length} prediction objects to client.`);

    // Return the array of initial prediction objects
    return NextResponse.json(predictions);

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


