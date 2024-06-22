
import { NextResponse } from "next/server";
import Replicate from "replicate";
import dotenv from 'dotenv';
import { auth } from "@clerk/nextjs/server";



dotenv.config();

export default async function createImages(req: Request): Promise<Response> {
  const { userId } = auth();
  // Parse Request Body
  const body = await req.json();

  // Extract Image Generation Parameters
  const { prompt, n = 1, size = "1024x1024", response_format = "url" } = body;
  
  // Handle OPTIONS requests
  if (req.method === "OPTIONS") {
    return NextResponse.json({ message: "OK" });
  }

  // Handle POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Retrieve API Key from Environment Variable
    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      return new Response("Missing REPLICATE_API_KEY environment variable", { status: 401 });
    }

    // Validate Input Parameters
    const validationErrors: string[] = [];
    if (!prompt) {
      validationErrors.push("Prompt is required");
    }
    if (isNaN(n) || n <= 0) {
      validationErrors.push("Number of images (n) must be a positive integer");
    }
    if (!size.match(/^\d+x\d+$/)) {
      validationErrors.push("Resolution (size) must be in format WIDTHxHEIGHT");
    }
    if (!["url", "b64_json"].includes(response_format)) {
      validationErrors.push("Invalid response format. Choose 'url' or 'b64_json'");
    }

    if (validationErrors.length > 0) {
      return new Response(validationErrors.join(", "), { status: 400 });
    }

    // Generate Images using Replicate
    const replicate = new Replicate({ auth: apiKey });

    const [width, height] = size.split("x").map(Number);

    const input = {
      prompt: prompt,
      n: n,
      width: width,
      height: height,
      aspect_ratio: "3:2",
      output_quality: 79,
      negative_prompt: "ugly, distorted"
    };
    
    // Loop through the stream (actions within the loop not shown)
    for await (const event of replicate.stream("stability-ai/stable-diffusion-3", { input })) {
      console.log(event);
    };

    // Return Image URLs or Base64 Data (depending on response_format)
    if (response_format === "url") {
      return new Response(JSON.stringify(Response), { status: 200 });
    } else if (response_format === "b64_json") {
      return new Response(JSON.stringify({ image: Response }), { status: 200 });
    } else {
      return new Response("Invalid response format. Choose 'url' or 'b64_json'", { status: 400 });
    }
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}


  
  


  
  
      
  






  
  