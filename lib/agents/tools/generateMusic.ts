// lib/agents/tools/generateMusic.ts
// Agentic tool: generate_music. Dispatches a MusicGen prediction via the shared
// lib/media/music core (shared credit deduction + Replicate submission).
import { z } from "zod";
import { Tool, ToolResult, AgentContext } from "../core/types";
import { createMusicPrediction, CreditInsufficientError } from "@/lib/media/music";
import { MediaEnvelope } from "@/lib/media/envelope";
import { logger } from "@/lib/logger";

const GenerateMusicInputSchema = z.object({
  prompt: z.string().min(1).max(1000).describe("Describe the music/sound to generate"),
  duration: z.number().int().min(5).max(300).optional().describe("Length in seconds (5-300)"),
  output_format: z.enum(["mp3", "wav"]).optional().describe("Output audio format"),
  model_version: z.string().optional().describe("MusicGen model version (default stereo-large)"),
});

type GenerateMusicInput = z.infer<typeof GenerateMusicInputSchema>;

export const generateMusicTool: Tool = {
  name: "generate_music",
  description:
    "Generate an AI-composed music track from a text prompt. Use this when the user asks you " +
    "to create a song, beat, instrumental, ambient sound, or any audio from a description. " +
    "Returns a prediction id and a poll URL; the client renders an audio player once complete.",
  schema: GenerateMusicInputSchema,
  risk: "mutative",
  requiresApproval: true,
  timeoutMs: 30000,

  async execute(input: GenerateMusicInput, context: AgentContext): Promise<ToolResult> {
    try {
      const result = await createMusicPrediction(
        {
          prompt: input.prompt,
          duration: input.duration,
          output_format: input.output_format,
          model_version: input.model_version,
        },
        context.userId,
        context.sessionId // idempotency key: one deduction per agent turn
      );

      return {
        success: true,
        data: {
          _media: {
            type: "music",
            predictionId: result.predictionId,
            pollUrl: result.pollUrl,
            status: "pending",
          } satisfies MediaEnvelope,
          predictionId: result.predictionId,
          status: result.status,
          pollUrl: result.pollUrl,
          message: `Music generation started. Track it at ${result.pollUrl}.`,
        },
      };
    } catch (error: any) {
      logger.error("[generateMusicTool] failed:", { error: error?.message });
      if (error instanceof CreditInsufficientError) {
        return {
          success: false,
          error: `Insufficient credits: you need more credits to generate music. (${error.remaining} remaining)`,
        };
      }
      return {
        success: false,
        error: error?.message || "Music generation failed to start.",
      };
    }
  },
};