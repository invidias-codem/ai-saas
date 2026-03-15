import { z } from "zod";
import { Tool, AgentContext, ToolResult } from "../core/types";
import { logger } from "@/lib/logger";

/**
 * Novel / Creative Writing Tool — Agentic Mode
 *
 * Generates long-form creative writing: novels, short stories, screenplays,
 * poetry collections, and creative non-fiction. Claude (Agentic toggle) uses
 * this tool when the user requests creative writing beyond a simple chat response.
 *
 * Handles: chapters, multi-act structures, character sheets, plot outlines,
 * and complete short stories.
 */

const NovelWriterInputSchema = z.object({
  title: z.string().describe("Title of the work (or working title)"),
  genre: z
    .enum([
      "literary-fiction",
      "sci-fi",
      "fantasy",
      "thriller",
      "romance",
      "horror",
      "mystery",
      "historical-fiction",
      "short-story",
      "screenplay",
      "poetry",
      "creative-nonfiction",
    ])
    .describe("Genre of the creative work"),
  premise: z.string().describe("The core premise, plot summary, or creative brief"),
  format: z
    .enum(["full-chapter", "short-story", "outline-only", "character-sheet", "scene", "poem"])
    .default("short-story")
    .describe("What to generate: a full chapter, short story, outline, character sheet, scene, or poem"),
  pov: z
    .enum(["first-person", "third-person-limited", "third-person-omniscient", "second-person"])
    .optional()
    .default("third-person-limited")
    .describe("Point of view / narrative perspective"),
  tone: z
    .enum(["dark", "hopeful", "comedic", "suspenseful", "romantic", "melancholic", "epic", "intimate"])
    .optional()
    .default("intimate")
    .describe("Emotional tone of the writing"),
  characters: z
    .array(z.string())
    .optional()
    .describe("Optional: list of character names or brief descriptions to include"),
  targetLength: z
    .enum(["short", "medium", "long"])
    .optional()
    .default("medium")
    .describe("short (~800 words), medium (~2000 words), long (~4000 words)"),
});

type NovelWriterInput = z.infer<typeof NovelWriterInputSchema>;

const LENGTH_GUIDANCE: Record<string, string> = {
  short: "~800 words. Be tight, punchy, every sentence earning its place.",
  medium: "~2000 words. Full arc with setup, rising tension, and resolution.",
  long: "~4000 words. Rich world-building, deep character interiority, multiple scenes.",
};

export const novelWriterTool: Tool = {
  name: "write_creative_content",
  description:
    "Write long-form creative content: novels, short stories, screenplays, chapters, scenes, or poetry. " +
    "Handles full narratives with plot structure, character development, and world-building. " +
    "Use this when the user asks you to write a story, novel, chapter, screenplay, or creative piece " +
    "that requires more than a brief conversational response.",
  schema: NovelWriterInputSchema,
  risk: "read-only",
  requiresApproval: false,
  timeoutMs: 120000, // 2 min for long-form

  async execute(input: NovelWriterInput, _context: AgentContext): Promise<ToolResult> {
    try {
      const lengthGuide = LENGTH_GUIDANCE[input.targetLength ?? "medium"];
      const characterContext = input.characters?.length
        ? `\n\n**Characters to feature:** ${input.characters.join(", ")}`
        : "";

      const formatInstructions: Record<string, string> = {
        "full-chapter":
          "Write a complete chapter with: opening hook, scene-setting, character interiority, dialogue, rising action, and a chapter-ending hook.",
        "short-story":
          "Write a complete short story with a clear beginning, middle, and end. Include a satisfying arc.",
        "outline-only":
          "Write a detailed outline: premise, 3-act structure, chapter breakdowns, character arcs, and key plot beats.",
        "character-sheet":
          "Create rich character sheets with: name, background, personality, goals, fears, voice, and narrative role.",
        scene:
          "Write a single vivid scene with strong sensory detail, subtext in dialogue, and clear emotional stakes.",
        poem:
          "Write a complete poem or poetry collection piece with intentional form, imagery, and rhythm.",
      };

      const formatGuide = formatInstructions[input.format ?? "short-story"];

      const systemPrompt = `You are a masterful creative writer with the craft of the best contemporary literary authors. 
You write with specificity, emotional truth, and a distinctive voice. 
You never use clichés or purple prose. You show, don't tell. 
Your dialogue reveals character. Your descriptions earn their place.`;

      const prompt = `Write the following creative work:

**Title:** ${input.title}
**Genre:** ${input.genre.replace(/-/g, " ")}
**Premise:** ${input.premise}${characterContext}

**Format:** ${formatGuide}
**Point of View:** ${(input.pov ?? "third-person-limited").replace(/-/g, " ")}
**Tone:** ${input.tone ?? "intimate"}
**Length Guidance:** ${lengthGuide}

Craft this with full literary intentionality. Begin immediately — no preamble.`;

      // Use Gemini Pro for creative generation
      const { GeminiProvider } = await import("@/lib/llm/providers/gemini");
      const gemini = new GeminiProvider();

      const result = await gemini.generateStream(
        [{ role: "user", text: prompt, attachments: undefined }],
        systemPrompt,
        {
          temperature: 0.85, // Higher temp for creative writing
          maxTokens: input.targetLength === "long" ? 8192 : input.targetLength === "medium" ? 4096 : 2048,
        }
      );

      // Collect full stream
      const reader = result.stream.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullContent += decoder.decode(value, { stream: true });
      }

      return {
        success: true,
        data: {
          content: fullContent,
          title: input.title,
          genre: input.genre,
          format: input.format,
          wordCount: fullContent.split(/\s+/).length,
        },
      };
    } catch (error: any) {
      logger.error("[novelWriterTool] Error", error);
      return { success: false, error: error.message ?? "Creative writing failed" };
    }
  },
};
