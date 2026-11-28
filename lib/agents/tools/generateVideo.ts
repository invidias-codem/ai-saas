// lib/agents/tools/generateVideo.ts
// Agentic tool: generate_video. Async Veo 3 prediction via the shared
// lib/media/video core (credit deduction + Replicate submission).
import { z } from "zod";
import { Tool, ToolResult, AgentContext } from "../core/types";
import { createVideoPrediction, VideoCreditInsufficientError } from "@/lib/media/video";
import { MediaEnvelope } from "@/lib/media/envelope";
import { logger } from "@/lib/logger";

const GenerateVideoInputSchema = z.object({
  prompt: z.string().min(1).max(2000).describe("Describe the video to generate"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional().default("16:9").describe("Aspect ratio"),
  duration: z.number().int().positive().optional().describe("Length in seconds"),
  resolution: z.enum(["720p", "1080p"]).optional().describe("Video resolution"),
});

type GenerateVideoInput = z.infer<typeof GenerateVideoInputSchema>;

export const generateVideoTool: Tool = {
  name: "generate_video",
  description:
    "Generate an AI video (Veo 3) from a text prompt. Use this when the user asks you to create " +
    "a clip, animation, or video. Returns a prediction id and a poll URL; the client renders a " +
    "video player once generation completes.",
  schema: GenerateVideoInputSchema,
  risk: "mutative",
  requiresApproval: true,
  timeoutMs: 30000,

  async execute(input: GenerateVideoInput, context: AgentContext): Promise<ToolResult> {
    try {
      const result = await createVideoPrediction(
        {
          prompt: input.prompt,
          aspectRatio: input.aspectRatio,
          duration: input.duration,
          resolution: input.resolution,
        },
        context.userId,
        context.sessionId
      );

      return {
        success: true,
        data: {
          _media: {
            type: "video",
            predictionId: result.predictionId,
            pollUrl: result.pollUrl,
            status: "pending",
          } satisfies MediaEnvelope,
          predictionId: result.predictionId,
          status: result.status,
          pollUrl: result.pollUrl,
          message: `Video generation started. Track it at ${result.pollUrl}.`,
        },
      };
    } catch (error: any) {
      logger.error("[generateVideoTool] failed:", { error: error?.message });
      if (error instanceof VideoCreditInsufficientError) {
        return {
          success: false,
          error: `Insufficient credits: you need more credits to generate video. (${error.remaining} remaining)`,
        };
      }
      return {
        success: false,
        error: error?.message || "Video generation failed to start.",
      };
    }
  },
};