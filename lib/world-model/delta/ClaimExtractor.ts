import { GoogleGenerativeAI } from "@google/generative-ai";
import { ExtractedClaim } from "./types";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

function stripThoughtSignature(text: string): string {
  return text.replace(/<thought_signature>[\s\S]*?<\/thought_signature>/gi, "").trim();
}

function extractFirstJsonPayload(text: string): string {
  const cleaned = stripThoughtSignature(text).trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const source = fenced ? fenced[1].trim() : cleaned;

  const firstArray = source.indexOf("[");
  const lastArray = source.lastIndexOf("]");
  if (firstArray !== -1 && lastArray !== -1 && lastArray > firstArray) {
    return source.slice(firstArray, lastArray + 1);
  }

  const firstObj = source.indexOf("{");
  const lastObj = source.lastIndexOf("}");
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    return source.slice(firstObj, lastObj + 1);
  }

  return source;
}

export class ClaimExtractor {
  async extractClaims(
    text: string,
    sessionId: string,
    modelName: string
  ): Promise<ExtractedClaim[]> {
    if (!text || text.trim().length === 0) return [];

    try {
      const prompt = `
        Analyze the following text and extract atomic claims.
        Return a JSON array of objects with these fields:
        - subject: string
        - predicate: string
        - object: string
        - domain: 'code' | 'current_events' | 'product' | 'personal' | 'general'
        - confidence: number (0.0-1.0)
        
        Text:
        "${text}"
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const jsonText = extractFirstJsonPayload(response.text());

      try {
        const claims = JSON.parse(jsonText);

        return claims.map((c: any) => ({
          id: crypto.randomUUID(),
          text: `${c.subject} ${c.predicate} ${c.object}`,
          embedding: undefined,
          subject: c.subject,
          predicate: c.predicate,
          object: c.object,
          domain: c.domain,
          confidence: c.confidence,
        }));
      } catch (e) {
        console.error("Failed to parse claims JSON", e);
        console.error("Raw claims response:", response.text());
        return [];
      }
    } catch (error) {
      console.error("Error extracting claims:", error);
      return [];
    }
  }
}

export const claimExtractor = new ClaimExtractor();
