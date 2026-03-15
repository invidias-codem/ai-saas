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

// Model identifier
const SEEDREAM_MODEL = "bytedance/seedream-4";

// Define the input schema
const requestSchema = z.object({
  prompt: z.string().min(1, { message: "Prompt cannot be empty." }),
  amount: z.coerce.number().int().min(1).max(4).default(1), 
  resolution: z.string().min(1).default("1024x1024"),
});

// Helper to parse resolution string
function parseResolution(resolution: string): { width: number, height: number } {
    const parts = resolution.split('x');
    if (parts.length === 2) {
        const width = parseInt(parts[0], 10);
        const height = parseInt(parts[1], 10);
        if (!isNaN(width) && !isNaN(height) && width >= 1024 && height >= 1024) { 
            return { width, height };
        }
    }
    console.warn(`Invalid or unsupported resolution string "${resolution}", defaulting to 1024x1024`);
    return { width: 1024, height: 1024 }; // Fallback
}

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

    const { prompt, amount, resolution } = validation.data;
    const { width, height } = parseResolution(resolution);

    // Prepare input for the seedream-4 model
    const input = {
      prompt: prompt,
      width: width,
      height: height,
      max_images: amount, 
      sequential_image_generation: (amount > 1 ? "auto" : "disabled") as "auto" | "disabled",
    };
    
    console.log(`Starting Replicate prediction for ${SEEDREAM_MODEL} with input:`, input);

    // ✅ Call Replicate's create prediction API (asynchronous)
    const prediction = await replicate.predictions.create({
        model: SEEDREAM_MODEL,
        input: input,
    });

    console.log("Replicate job started. Sending prediction object to client:", prediction.id);

    // ✅ Return the initial prediction object
    return NextResponse.json(prediction);

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


  
  


  
  
      
  






  
  