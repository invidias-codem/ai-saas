"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.researchWriterTool = void 0;
const zod_1 = require("zod");
const logger_1 = require("@/lib/logger");
/**
 * Research Paper Writer Tool — Agentic Mode
 *
 * Given a topic and optional parameters, generates a structured academic-style
 * research paper outline and full draft. Claude (Agentic toggle) uses this tool
 * when a user requests a research paper, white paper, or long-form analysis.
 *
 * The tool itself triggers a deeper Gemini Quality pass to produce the content,
 * then returns the full document as a structured markdown string.
 */
const ResearchWriterInputSchema = zod_1.z.object({
    topic: zod_1.z.string().describe("The research topic or thesis statement"),
    sections: zod_1.z
        .array(zod_1.z.string())
        .optional()
        .describe("Optional: specific sections to include (e.g. ['Abstract', 'Introduction', 'Methodology']). " +
        "If omitted, standard academic structure is used."),
    style: zod_1.z
        .enum(["academic", "white-paper", "technical-report", "literature-review"])
        .optional()
        .default("academic")
        .describe("Document style/format"),
    depth: zod_1.z
        .enum(["brief", "standard", "comprehensive"])
        .optional()
        .default("standard")
        .describe("Depth of research: brief (~1000 words), standard (~2500 words), comprehensive (~5000 words)"),
    includeReferences: zod_1.z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to include a references/bibliography section"),
});
const DEFAULT_SECTIONS = {
    academic: ["Abstract", "Introduction", "Background & Literature Review", "Methodology", "Analysis & Findings", "Discussion", "Conclusion", "References"],
    "white-paper": ["Executive Summary", "Problem Statement", "Current Landscape", "Proposed Solution", "Technical Details", "Implementation Roadmap", "Conclusion"],
    "technical-report": ["Summary", "Introduction", "Technical Background", "Architecture & Design", "Implementation Details", "Testing & Validation", "Conclusions & Recommendations"],
    "literature-review": ["Abstract", "Introduction", "Search Methodology", "Thematic Analysis", "Critical Evaluation", "Synthesis", "Conclusion", "Bibliography"],
};
const DEPTH_GUIDANCE = {
    brief: "Write concisely. Each section should be 1-2 paragraphs (~150 words). Total ~1000 words.",
    standard: "Write with moderate depth. Each section should be 3-4 paragraphs (~300 words). Total ~2500 words.",
    comprehensive: "Write comprehensively with full academic rigor. Each section 5-7 paragraphs (~600 words). Total ~5000 words.",
};
exports.researchWriterTool = {
    name: "write_research_paper",
    description: "Write a structured research paper, white paper, technical report, or literature review on any topic. " +
        "Produces a complete, well-organized document in markdown format with proper sections. " +
        "Use this when the user asks you to write, draft, or generate a research paper, report, or long-form analysis.",
    schema: ResearchWriterInputSchema,
    risk: "read-only",
    requiresApproval: false,
    timeoutMs: 90000, // 90s — long-form generation
    async execute(input, context) {
        try {
            const style = input.style ?? "academic";
            const depth = input.depth ?? "standard";
            const sections = input.sections ?? DEFAULT_SECTIONS[style] ?? DEFAULT_SECTIONS.academic;
            const depthGuide = DEPTH_GUIDANCE[depth];
            // Build the full document prompt for Gemini (Quality model)
            const prompt = `You are an expert academic writer and researcher. Write a complete ${style.replace("-", " ")} on the following topic:

**Topic:** ${input.topic}

**Document Structure:**
${sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}

**Depth Guidance:** ${depthGuide}

**Instructions:**
- Use proper markdown formatting with ## for section headers
- Write in authoritative, professional language appropriate for a ${style.replace("-", " ")}
- Each section should flow naturally into the next
- Include concrete examples, data points, and specific details where relevant
- Do NOT use filler phrases like "In conclusion, as we have discussed..."
- Be specific, substantive, and insightful throughout
${input.includeReferences ? "- Include a References section with plausible academic citations in APA format" : "- Do not include a references section"}

Begin the document now:`;
            // Use Gemini Pro for quality long-form generation (not Claude — saves tokens)
            const { GeminiProvider } = await Promise.resolve().then(() => __importStar(require("@/lib/llm/providers/gemini")));
            const gemini = new GeminiProvider();
            const result = await gemini.generateStream([{ role: "user", text: prompt, attachments: undefined }], `You are an expert research writer. Produce complete, high-quality ${style} documents.`, {
                temperature: 0.4,
                maxTokens: depth === "comprehensive" ? 8192 : depth === "standard" ? 4096 : 2048,
            });
            // Collect the full streamed response
            const reader = result.stream.getReader();
            const decoder = new TextDecoder();
            let fullContent = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                fullContent += decoder.decode(value, { stream: true });
            }
            return {
                success: true,
                data: {
                    document: fullContent,
                    topic: input.topic,
                    style,
                    depth,
                    sections,
                    wordCount: fullContent.split(/\s+/).length,
                },
            };
        }
        catch (error) {
            logger_1.logger.error("[researchWriterTool] Error", error);
            return { success: false, error: error.message ?? "Research writing failed" };
        }
    },
};
