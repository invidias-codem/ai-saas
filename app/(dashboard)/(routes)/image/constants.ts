import * as z from "zod";

export const formSchema = z.object({
    prompt: z.string().min(1, "Image prompt is required"),
    amount: z.string().min(1),
    resolution: z.string().min(1)
});

export const amountOptions = [
    { value: "1", label: "1 Photo" },
    { value: "2", label: "2 Photos" },
    { value: "3", label: "3 Photos" },
    { value: "4", label: "4 Photos" },
    // Imagen 3's default model supports 1-8 images.
];

// ✅ UPDATED: Valid resolutions for Imagen 3
export const resolutionOptions = [
    { value: "1024x1024", label: "Square (1024x1024)" },
    { value: "1536x680", label: "Widescreen (1536x680)" },
    { value: "680x1536", label: "Portrait (680x1536)" },
];