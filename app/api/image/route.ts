
import { NextResponse } from "next/server";
import { OpenAI } from "openai"
import dotenv from 'dotenv';
import { toBase64 } from "openai/core.mjs";

dotenv.config();

export default async function createImages(req: Request) {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
  
    try {
      // Retrieve API Key from Environment Variable
      const apiKey = process.env.OPENAI_API_KEY;
  
      // Check if API Key Exists
      if (!apiKey) {
        return new Response("Missing OPENAI_API_KEY environment variable", { status: 401 });
      }
  
      const authorizationHeader = `Bearer ${apiKey}`;
  
      // Parse Request Body
      const body = await req.json();
  
      // Extract Image Generation Parameters
      const { prompt, n = 1, size = "1024x1024", response_format = toBase64 } = body;
  
      // Validate Input Parameters (unchanged)
      const validationErrors: string[] = [];
      if (!prompt) {
        validationErrors.push("Prompt is required");
      }
      if (!n || isNaN(n) || n <= 0) {
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
  
      // Generate Images using OpenAI API (workaround)
      const url = `https://api.openai.com/v1/images/generations`;
      const response = await fetch(url[0], {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorizationHeader,
        },
        body: JSON.stringify({
          model:"dall-e-3",
          prompt,
          n: 1,
          size,
          response_format,
        }),
      });
  
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
  
      const data = await response.json();
  
      // Return Image URLs or Base64 Data (depending on response_format)
      return NextResponse.json(data.data);
    } catch (error: any) {
      console.error("[IMAGE_ERROR]", error);
      return new Response("Internal error", { status: 500 });
    }
  }
  
  


  
  
      
  






  
  