// app/api/music/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { PredictionServiceClient } from "@google-cloud/aiplatform";
import { helpers, protos } from "@google-cloud/aiplatform";
import { z } from "zod";

// Define the expected request body schema
const requestSchema = z.object({
  prompt: z.string().min(1, { message: "Prompt cannot be empty." }),
  // Lyria might support different/more parameters, check documentation if needed
  duration: z.number().int().positive().optional().default(30), 
});

export async function POST(req: Request) {
  let prompt: string | undefined = undefined; 
  try {
    // 1. Authentication
    const { userId } = auth();
    if (!userId) {
      console.warn("Unauthorized access attempt to /api/music");
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    // 2. Input Validation
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

    prompt = validation.data.prompt;
    const duration_seconds = validation.data.duration;
    console.log(`Received music generation request for prompt: "${prompt}", duration: ${duration_seconds}s`);

    // 3. Initialize Vertex AI Client
    const clientOptions = {
      apiEndpoint: `${env.GOOGLE_LOCATION}-aiplatform.googleapis.com`,
    };
    const predictionServiceClient = new PredictionServiceClient(clientOptions);

    // 4. Define Endpoint and Prepare Request
    // ✅ Use the lyria-002 model ID based on the URL
    const endpoint = `projects/${env.GOOGLE_PROJECT_ID}/locations/${env.GOOGLE_LOCATION}/publishers/google/models/lyria-002`; 

    // Prepare instance and parameters (adjust if Lyria needs different structure)
    const instance = { prompt: prompt };
    const parameters = { duration_seconds: duration_seconds }; 

    const instanceValue = helpers.toValue(instance);
    const parametersValue = helpers.toValue(parameters);

    if (!instanceValue) throw new Error("Failed to convert instance payload.");
    if (!parametersValue) throw new Error("Failed to convert parameters payload.");

    // Request object (assuming standard structure, adjust if Lyria needs specifics)
    const request = {
      endpoint,
      instances: [instanceValue],
      parameters: parametersValue,
    };
    console.log("Sending request to Vertex AI endpoint:", endpoint);

    // 5. Call Vertex AI API
    const [response] = await predictionServiceClient.predict(request);
    console.log("Received response from Vertex AI.");

    // 6. Process Response
    if (!response.predictions || response.predictions.length === 0) {
      throw new Error("API response contained no predictions.");
    }

    const predictionProto = response.predictions[0];
    if (!predictionProto) {
      throw new Error("API returned an undefined prediction.");
    }

    // Extract audio data (SPECULATIVE - ADJUST BASED ON ACTUAL MODEL RESPONSE)
    const base64Audio = predictionProto.structValue?.fields?.['bytesBase64Encoded']?.stringValue || predictionProto.structValue?.fields?.['audioContent']?.stringValue;
    const audioUri = predictionProto.structValue?.fields?.['signedUri']?.stringValue;

    let audioOutput: string;

    if (typeof base64Audio === 'string') {
      console.log("Extracted base64 audio data.");
      // Lyria might output WAV, adjust mime type if needed
      audioOutput = `data:audio/wav;base64,${base64Audio}`; 
    } else if (typeof audioUri === 'string') {
      console.log("Extracted audio URI.");
      audioOutput = audioUri;
    } else {
      console.error("Failed to extract audio data. Full Prediction Proto:", JSON.stringify(predictionProto, null, 2));
      throw new Error("Invalid prediction format: Could not find audio data (base64 or URI). Check server logs.");
    }

    // 7. Return Success Response
    console.log("Successfully generated music.");
    return NextResponse.json({ audio: audioOutput });

  } catch (error: any) {
    // Enhanced Error Logging
    console.error(`[MUSIC_API_ERROR] Prompt: "${prompt || 'N/A'}" | Error:`, error);
    const errorMessage = error.message || "An unknown error occurred";
    const details = error.details || errorMessage; 

    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      details: details 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}










  
  


  
  
      
  






  
  