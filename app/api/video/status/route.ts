// app/api/video/status/route.ts
import { NextResponse } from "next/server";
import { auth as getClerkAuth } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { GoogleAuth } from "google-auth-library";
import axios from "axios";

const googleAuth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
});

export async function GET(req: Request) {
  let operationNameFromQuery: string | null = null;
  try {
    const { userId } = getClerkAuth();
    if (!userId) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const { searchParams } = new URL(req.url);
    operationNameFromQuery = searchParams.get("operationName");
    if (!operationNameFromQuery) {
      return new NextResponse(JSON.stringify({ error: "Missing operationName parameter." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const operationName = operationNameFromQuery;
    console.log("Checking status for operation:", operationName);

    const client = await googleAuth.getClient();
    const accessToken = (await client.getAccessToken()).token;
     if (!accessToken) {
        throw new Error("Failed to retrieve access token.");
    }

    const basePathMatch = operationName.match(/(.*)\/operations\/.*/);
    if (!basePathMatch || !basePathMatch[1]) {
        throw new Error(`Could not extract base path from operation name: ${operationName}`);
    }
    const basePath = basePathMatch[1];

    const apiUrl = `https://${env.GOOGLE_LOCATION}-aiplatform.googleapis.com/v1beta1/${basePath}:fetchPredictOperation`;

    const requestBody = {
        operationName: operationName
    };

    console.log("Polling status URL:", apiUrl);
    console.log("Polling request body:", JSON.stringify(requestBody));

    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log("Received status response:", JSON.stringify(response.data, null, 2)); // Log the full response data

    const operation = response.data;

    if (operation.done) {
      if (operation.error) {
        console.error("Video generation failed:", operation.error);
        return NextResponse.json({
            status: "failed",
            error: operation.error.message || "Operation failed."
        });
      } else {
        console.log("Video generation completed successfully.");

        // ✅ Refined Extraction Logic with more checks
        const operationResponse = operation.response;
        const rawVideosArray = operationResponse?.videos; // Access the videos array

        // Log the raw array for inspection
        console.log("Raw videos array from operation response:", JSON.stringify(rawVideosArray, null, 2));

        let videoResults: { gcsUri?: string; mimeType?: string }[] = []; // Initialize as empty array

        // Check if rawVideosArray exists and is an array
        if (Array.isArray(rawVideosArray)) {
            videoResults = rawVideosArray.map((video: any) => { // Use 'any' for flexibility during debugging
                // Log each individual video object
                console.log("Processing video object:", JSON.stringify(video, null, 2));

                // Try common property names for GCS URI
                const uri = video?.gcsUri || video?.uri || video?.gcs_uri;
                const type = video?.mimeType || video?.mime_type;

                if (!uri) {
                    console.warn("Could not find GCS URI property (gcsUri, uri, gcs_uri) in video object:", video);
                }
                 if (!type) {
                    console.warn("Could not find mimeType property (mimeType, mime_type) in video object:", video);
                }

                return {
                    gcsUri: uri,
                    mimeType: type
                };
            }).filter(v => !!v.gcsUri); // Filter out entries where URI couldn't be found
        } else {
            console.warn("Operation response did not contain a 'videos' array or it was not an array.");
        }


        if (videoResults.length === 0) {
            console.warn("Operation completed but no valid video URIs could be extracted. Check raw logs.");
        } else {
             console.log("Successfully extracted video results:", JSON.stringify(videoResults, null, 2));
        }

        return NextResponse.json({
            status: "completed",
            videos: videoResults // Send the extracted results (could be empty)
        });
      }
    } else {
      console.log("Video generation still processing...");
      return NextResponse.json({ status: "processing" });
    }

  } catch (error: any) {
    console.error(`[VIDEO_STATUS_ERROR] Operation Query Param: "${operationNameFromQuery || 'N/A'}" | Error:`, error.response?.data || error.message);
    const details = error.response?.data?.error?.message || error.message || "An unknown error occurred";
     return new NextResponse(JSON.stringify({
      error: "Error checking status",
      details: details
    }), {
      status: error.response?.status || 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}