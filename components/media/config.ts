/**
 * Centralized media configuration: zod form schemas + option presets for the
 * image, video, and music generation surfaces.
 *
 * Migrated verbatim from the per-modality `constants.ts` files. Each surface
 * keeps its own distinct schema/options; a shared `MediaOption` type documents
 * the common shape (value + label, optional description/badge).
 */
import * as z from "zod";
import { promptSchema } from "@/lib/schemas";

/** Common shape for select-option presets across all three modalities. */
export interface MediaOption {
  value: string;
  label: string;
  description?: string;
  badge?: string | null;
}

/* ────────────────────────────── Image ────────────────────────────── */

export const imageFormSchema = z.object({
  prompt: z.string().min(1, { message: "Image prompt is required" }),
  amount: z.string().min(1),
  resolution: z.string().min(1),
  model: z.string().optional(),
});

export const imageAmountOptions: MediaOption[] = [
  { value: "1", label: "1 Photo" },
  { value: "2", label: "2 Photos" },
  { value: "3", label: "3 Photos" },
  { value: "4", label: "4 Photos" },
];

export const imageResolutionOptions: MediaOption[] = [
  { value: "1:1", label: "Square (1:1)" },
  { value: "16:9", label: "Landscape (16:9)" },
  { value: "9:16", label: "Portrait (9:16)" },
  { value: "4:3", label: "Standard (4:3)" },
  { value: "3:4", label: "Tall (3:4)" },
  { value: "3:2", label: "Classic (3:2)" },
  { value: "2:3", label: "Classic Tall (2:3)" },
];

export const imageModelOptions: MediaOption[] = [
  { value: "flux-schnell", label: "Flux Schnell", description: "Fast, high quality (5-10s)", badge: "Recommended" },
  { value: "sdxl", label: "Stable Diffusion XL", description: "Detailed, reliable (10-20s)", badge: null },
  { value: "playground-v2.5", label: "Playground v2.5", description: "Very fast (3-5s)", badge: "Fastest" },
];

/* ────────────────────────────── Video ────────────────────────────── */

export const videoFormSchema = z.object({
  prompt: z.string().min(1, { message: "Video prompt cannot be empty." }),
  aspectRatio: z.string().optional().default("16:9"),
  duration: z.string().optional().default("4"), // Veo 3 supports 4, 6, 8
  resolution: z.string().optional().default("720p"), // Veo 3 supports 720p, 1080p
});

export const videoResolutionOptions: MediaOption[] = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p (slower)" },
];

export const videoDurationOptions: MediaOption[] = [
  { value: "4", label: "4 seconds" },
  { value: "6", label: "6 seconds" },
  { value: "8", label: "8 seconds" },
];

export const videoAspectRatioOptions: MediaOption[] = [
  { value: "16:9", label: "Widescreen (16:9)" },
  { value: "9:16", label: "Portrait (9:16)" },
  { value: "1:1", label: "Square (1:1)" },
];

/* ────────────────────────────── Music ────────────────────────────── */

export const musicFormSchema = promptSchema;