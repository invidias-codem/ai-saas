import * as z from "zod";

export const formSchema = z.object({
  prompt: z.string().min(1, { message: "Video prompt cannot be empty." }),
  aspectRatio: z.string().optional().default("16:9"),
  duration: z.string().optional().default("4"), // Veo 3 supports 4, 6, 8
  resolution: z.string().optional().default("720p"), // Veo 3 supports 720p, 1080p
});

export const resolutionOptions = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p (slower)" },
];

export const durationOptions = [
  { value: "4", label: "4 seconds" },
  { value: "6", label: "6 seconds" },
  { value: "8", label: "8 seconds" },
];

export const aspectRatioOptions = [
  { value: "16:9", label: "Widescreen (16:9)" },
  { value: "9:16", label: "Portrait (9:16)" },
  { value: "1:1", label: "Square (1:1)" },
];