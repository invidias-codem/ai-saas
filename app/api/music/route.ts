
import { NextResponse } from "next/server";
import dotenv from "dotenv";
import { auth } from "@clerk/nextjs/server";

dotenv.config();

export async function POST(req: Request) {
  const { userId } = auth();
  const body = await req.json();
  const { prompt } = body;

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!prompt) {
    return new Response("Missing prompt", { status: 400 });
  }

  const Replicate = require("replicate");
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN!,
  });

  try {
    // Choose one approach based on your desired behavior
    const input = {
      // Option 1: Combine prompt and prefix (if needed)
      prompt_b: prompt ? `90's Rap ${prompt}` : "90's Rap",
    };

    // Option 2: Use user prompt directly
    // const input = { prompt };

    const response = await replicate.run(
      "riffusion/riffusion:8cf61ea6c56afd61d8f5b9ffd14d7c216c0a93844ce2d82ac1c9ecc9c7f24e05",
      { input } // Use the chosen input object
    );

    console.log("Music generated successfully:", response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Replicate API error:", error);
    
    // Handle specific Replicate API errors (if applicable)
    // and return more informative error messages

    return new Response(" Music Error", { status: 500 });
  }

}










  
  


  
  
      
  






  
  