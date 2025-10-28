// lib/schemas.ts
import * as z from "zod";

export const promptSchema = z.object({
    prompt: z.string().min(1, "Prompt is required")
});