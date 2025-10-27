// app/api/music/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { z } from "zod";
// ✅ Replace low-level client imports with direct REST tools
import { GoogleAuth } from "google-auth-library"; 
import axios from "axios"; 

// 1. Initialize Google Auth client (does not require a local file)
const googleAuth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
});

// Define the expected request body schema
const requestSchema = z.object({
  prompt: z.string().min(1, { message: "Prompt cannot be empty." }),
  duration: z.number().int().positive().optional().default(30), 
});

// Define the model ID and endpoint structure for Lyria
const MODEL_ID = 'lyria-002';
const API_ACTION = 'predict'; // Lyria is a synchronous prediction endpoint

export async function POST(req: Request) {
  let prompt: string | undefined = undefined; 
  try {
    // 2. Authentication
    const { userId } = auth();
    if (!userId) {
      console.warn("Unauthorized access attempt to /api/music");
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    // 3. Input Validation
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

    // 4. Construct API URL and Payload
    // Use the v1 endpoint for synchronous prediction
    const apiUrl = `https://${env.GOOGLE_LOCATION}-aiplatform.googleapis.com/v1/projects/${env.GOOGLE_PROJECT_ID}/locations/${env.GOOGLE_LOCATION}/publishers/google/models/${MODEL_ID}:${API_ACTION}`;
    
    // Request payload structure for Lyria (within instances and parameters)
    const requestPayload = {
      instances: [
        { prompt: prompt }
      ],
      parameters: { 
        duration_seconds: duration_seconds 
      },
    };

    // 5. Get an Access Token
    const client = await googleAuth.getClient();
    const accessToken = (await client.getAccessToken()).token;
    if (!accessToken) {
        throw new Error("Failed to retrieve access token.");
    }
    
    console.log("Sending REST request to Lyria endpoint:", apiUrl);

    // 6. Call Vertex AI API using axios
    const response = await axios.post(apiUrl, requestPayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`, // Pass token
        'Content-Type': 'application/json',
      },
    });
    
    console.log("Received response from Vertex AI.");

    // 7. Process Response
    const predictions = response.data.predictions;
    if (!predictions || predictions.length === 0) {
      throw new Error("API response contained no predictions.");
    }

    const prediction = predictions[0];

    // Extract audio data (properties may vary; stick to the logged pattern if available)
    const base64Audio = prediction?.bytesBase64Encoded || prediction?.audioContent;
    const audioUri = prediction?.signedUri;

    let audioOutput: string;

    if (typeof base64Audio === 'string') {
      console.log("Extracted base64 audio data.");
      // Assuming WAV based on file structure
      audioOutput = `data:audio/wav;base64,${base64Audio}`; 
    } else if (typeof audioUri === 'string') {
      console.log("Extracted audio URI.");
      audioOutput = audioUri;
    } else {
      console.error("Failed to extract audio data. Full Prediction:", JSON.stringify(prediction, null, 2));
      throw new Error("Invalid prediction format: Could not find audio data (base64 or URI). Check server logs.");
    }

    // 8. Return Success Response
    console.log("Successfully generated music.");
    return NextResponse.json({ audio: audioOutput });

  } catch (error: any) {
    // Enhanced Error Logging
    console.error(`[MUSIC_API_ERROR] Prompt: "${prompt || 'N/A'}" | Error:`, error.response?.data || error.message);
    const details = error.response?.data?.error?.message || error.message || "An unknown error occurred"; 

    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      details: details 
    }), {
      status: error.response?.status || 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}










  
  


  
  
      
  






  
  