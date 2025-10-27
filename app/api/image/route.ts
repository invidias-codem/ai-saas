// app/api/image/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { VertexAI } from "@google-cloud/vertexai"; 

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const vertex_ai = new VertexAI({
      project: env.GOOGLE_PROJECT_ID,
      location: env.GOOGLE_LOCATION,
    });

    const body = await req.json();
    const { prompt, amount = "1", resolution = "1024x1024" } = body;

    if (!prompt) {
      return new NextResponse("Prompt is required", { status: 400 });
    }

    const numImages = parseInt(amount, 10);
    const [height, width] = resolution.split("x").map(Number);

    const generativeModel = vertex_ai.getGenerativeModel({
      model: "gemini-1.5-flash-latest", // Or "gemini-1.5-pro-latest"
    });

    const request = {
      contents: [
        {
          role: "user",
          parts: [{ text: `Generate ${numImages} image(s) of: ${prompt}` }],
        },
      ],
      generationConfig: {
        responseMimeType: "image/png",
      },
    };

    const response = await generativeModel.generateContent(request);

    // ✅ 5. Safely extract the Base64 image data
    const candidates = response.response?.candidates; // Use optional chaining

    if (!candidates || candidates.length === 0) {
      // Throw an error if no candidates are returned
      throw new Error("API did not return any image candidates.");
    }

    const dataUrls = candidates.flatMap(candidate => 
      candidate.content.parts
        .filter(part => part.inlineData) // Filter for parts that have inlineData
        .map(part => {
          if (!part.inlineData) {
            // This check is for TypeScript, but the filter already handles it
            throw new Error("API part did not contain inlineData.");
          }
          // Convert Base64 to a Data URL
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        })
    );

    if (dataUrls.length === 0) {
      // Throw an error if candidates were returned but none had image data
      throw new Error("API returned candidates but no valid image data.");
    }
    
    // Slice to respect the user's requested amount
    const finalImages = dataUrls.slice(0, numImages);

    return NextResponse.json(finalImages);

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


  
  


  
  
      
  






  
  