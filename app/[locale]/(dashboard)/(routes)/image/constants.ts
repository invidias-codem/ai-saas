import * as z from "zod";
export const formSchema = z.object({
  prompt: z.string().min(1, {
    message: "Image prompt is required",
  }),
  amount: z.string().min(1),
  resolution: z.string().min(1),
  model: z.string().optional(),
});

export const amountOptions = [
  {
    value: "1",
    label: "1 Photo",
  },
  {
    value: "2",
    label: "2 Photos",
  },
  {
    value: "3",
    label: "3 Photos",
  },
  {
    value: "4",
    label: "4 Photos",
  },
];

// ✅ UPDATED: Valid resolutions for Imagen 3 / nano-banana
export const resolutionOptions = [
  { value: "1:1", label: "Square (1:1)" },
  { value: "16:9", label: "Landscape (16:9)" },
  { value: "9:16", label: "Portrait (9:16)" },
  { value: "4:3", label: "Standard (4:3)" },
  { value: "3:4", label: "Tall (3:4)" },
  { value: "3:2", label: "Classic (3:2)" },
  { value: "2:3", label: "Classic Tall (2:3)" },
];

export const modelOptions = [
  {
    value: "flux-schnell",
    label: "Flux Schnell",
    description: "Fast, high quality (5-10s)",
    badge: "Recommended"
  },
  {
    value: "sdxl",
    label: "Stable Diffusion XL",
    description: "Detailed, reliable (10-20s)",
    badge: null
  },
  {
    value: "playground-v2.5",
    label: "Playground v2.5",
    description: "Very fast (3-5s)",
    badge: "Fastest"
  },
];
