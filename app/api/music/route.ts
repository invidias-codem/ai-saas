// app/api/music/route.ts
// (Optimized for asynchronous polling - FIX)

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import Replicate from "replicate";
import { z } from "zod";

// 1. Initialize Replicate client
const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN,
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
const MODEL_ID = "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";

export async function POST(req: Request) {
  // ✅ Define prompt here to make it accessible in the catch block
  let prompt: string | undefined = undefined;

  try {
    // 4. Clerk Authentication
    const { userId } = auth();
    if (!userId) {
      console.warn("Unauthorized access attempt to /api/music");
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 5. Input Validation
    const body = await req.json();
    const validation = requestSchema.safeParse(body);

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
        model: MODEL_ID,
        input: input,
    });
    
    console.log("Replicate job started. Sending prediction object to client:", prediction.id);

    // 7. Return the initial prediction object
    return NextResponse.json(prediction);

  } catch (error: any) {
    // ✅ Use the 'prompt' variable which is now in scope
    console.error(`[MUSIC_API_ERROR] Prompt: "${prompt || 'N/A'}" | Error:`, error);
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










  
  


  
  
      
  






  
  