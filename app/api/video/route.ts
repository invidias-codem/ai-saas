// app/api/video/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { env } from '@/lib/env';
import { GoogleAuth } from 'google-auth-library'; // Import GoogleAuth
import axios from 'axios'; // Import axios

// 1. Initialize Google Auth, just like in your status route
const googleAuth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
  // This will automatically find your GOOGLE_APPLICATION_CREDENTIALS
});

// 2. Define your project constants
const outputBucket = 'gs://genie-ai-1ca85.firebasestorage.app/video-outputs/';
const modelId = 'veo-3.0-fast-generate-001'; // Or your preferred Veo model

export async function POST(request: Request) {
  try {
    // 3. Clerk Authentication
    const { userId } = auth();
    if (!userId) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    // 4. Read all parameters from the body
    const body = await request.json();
    const { 
      prompt, 
      aspectRatio, 
      duration, 
      resolution, 
      generateAudio = true 
    } = body;

    if (!prompt) {
      return new NextResponse(JSON.stringify({ error: "Prompt is required" }), { 
        status: 400, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    // 5. Construct the full API URL for the REST request
    const apiUrl = `https://${env.GOOGLE_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${env.GOOGLE_PROJECT_ID}/locations/${env.GOOGLE_LOCATION}/publishers/google/models/${modelId}:predictLongRunning`;

    // 6. Build the request payload as a plain JSON object
    // (No 'helpers.toValue' needed)
    const requestPayload = {
      instances: [
        {
          prompt: prompt,
          // You can also add 'image' here if you pass an image
        },
      ],
      parameters: {
        durationSeconds: parseInt(duration, 10) || 4,
        aspectRatio: aspectRatio || "16:9",
        resolution: resolution || "720p",
        generateAudio: generateAudio,
        outputVideoSpec: {
          outputGcsUri: outputBucket,
        },
      },
    };

    // 7. Get an auth token
    const client = await googleAuth.getClient();
    const accessToken = (await client.getAccessToken()).token;
    if (!accessToken) {
      throw new Error("Failed to retrieve access token.");
    }

    console.log('Sending long-running REST request to Veo model...');

    // 8. Make the POST request with axios
    const response = await axios.post(apiUrl, requestPayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // 9. Get the operation name from the response
    const operationName = response.data.name;
    if (!operationName) {
      throw new Error("API did not return an operation name.");
    }

    console.log("Started video generation operation:", operationName);

    // 10. Return the operation name for the client to poll
    return NextResponse.json({ operationName: operationName });

  } catch (error: any) {
    // 11. Handle errors (including axios errors)
    console.error('[VIDEO_API_ERROR]', error.response?.data || error.message);
    const details = error.response?.data?.error?.message || error.message || "Failed to start video generation.";
    return new NextResponse(JSON.stringify({ 
      error: "Internal Server Error",
      details: details
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}