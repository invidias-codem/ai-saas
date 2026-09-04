// lib/agents/tools/generateImage.ts
// Agentic tool: generate_image. Synchronous image generation via the shared
// lib/media/image core (credit deduction + generateImage service).
import { z } from "zod";
import { Tool, ToolResult, AgentContext } from "../core/types";
import { createImagePrediction, ImageCreditInsufficientError } from "@/lib/media/image";
import { MediaEnvelope } from "@/lib/media/envelope";
import { logger } from "@/lib/logger";

const GenerateImageInputSchema = z.object({
  prompt: z.string().min(1).max(2000).describe("Describe the image to generate"),
  amount: z.number().int().min(1).max(4).optional().default(1).describe("Number of images (1-4)"),
  resolution: z
    .enum(["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"])
    .optional()
    .default("1:1")
    .describe("Aspect ratio"),
  model: z
    .enum(["flux-schnell", "sdxl", "playground-v2.5"])
    .optional()
    .describe("Image model (default flux-schnell)"),
});

type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;

export const generateImageTool: Tool = {
  name: "generate_image",
  description:
    "Generate an AI image from a text prompt. Use this when the user asks you to create, draw, " +
    "illustrate, or visualize something. Returns stable image URLs; supports 1-4 images with a " +
    "chosen aspect ratio and model.",
  schema: GenerateImageInputSchema,
  risk: "mutative",
  requiresApproval: true,
  timeoutMs: 60000,

  async execute(input: GenerateImageInput, context: AgentContext): Promise<ToolResult> {
    try {
      const result = await createImagePrediction(
        {
          prompt: input.prompt,
          amount: input.amount ?? 1,
          aspectRatio: input.resolution ?? "1:1",
          model: input.model,
        },
        context.userId,
        context.sessionId
      );

      return {
        success: true,
        data: {
          _media: {
            type: "image",
            urls: result.images,
            status: "succeeded",
          } satisfies MediaEnvelope,
          images: result.images,
          model: result.model,
          message: `Generated ${result.images.length} image(s) with ${result.model}.`,
        },
      };
    } catch (error: any) {
      logger.error("[generateImageTool] failed:", { error: error?.message });
      if (error instanceof ImageCreditInsufficientError) {
        return {
          success: false,
          error: `Insufficient credits: you need more credits to generate images. (${error.remaining} remaining)`,
        };
      }
      return {
        success: false,
        error: error?.message || "Image generation failed.",
      };
    }
  },
};