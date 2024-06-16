import { NextResponse } from "next/server";
import Replicate from "replicate";
import dotenv from "dotenv";
import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

dotenv.config();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const input = {
  prompt_b: "90's rap"
};

const output = await replicate.run("riffusion/riffusion:8cf61ea6c56afd61d8f5b9ffd14d7c216c0a93844ce2d82ac1c9ecc9c7f24e05", { input });
Response.json(output)


export async function POST(
  req: Request
) {
  try {
    const { userId } = auth();
    const body = await req.json();
    const { prompt } = body;

    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (!prompt) {
      return new Response("Missing prompt", { status: 400 });
    }

    const output = await replicate.run(
      "riffusion/riffusion:8cf61ea6c56afd61d8f5b9ffd14d7c216c0a93844ce2d82ac1c9ecc9c7f24e05",
      { input: { 
        prompt_b: prompt,
        seed: 42,
        num_outputs: 1,
        guidance_scale: 7.5,
        num_inference_steps: 50,
        height: 512,
        width: 512,
        prompt_a: "90's rap",
        negative_prompt: "lowres, bad anatomy, bad proportions, cropped, worst quality, low quality, jpeg artifacts, watermark, signature, blurry"
      } 
    }
    );
    return NextResponse.json(output);
  } catch (error) {
    console.error(error);
    return new Response("Error", { status: 500 });
  }
}










  
  


  
  
      
  






  
  