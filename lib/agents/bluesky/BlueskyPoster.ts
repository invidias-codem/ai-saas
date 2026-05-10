import { ProactivePostPlanner, type ProactivePostPlan } from "./ProactivePostPlanner";

export interface GeneratedBlueskyPost {
  text: string;
  topic: string;
  angle: string;
}

export class BlueskyPoster {
  constructor(
    private readonly planner: ProactivePostPlanner,
    private readonly generateText: (prompt: string) => Promise<string>
  ) {}

  async generateProactivePost(existingTopics: string[] = []): Promise<GeneratedBlueskyPost> {
    const plan = this.planner.planNextPost(existingTopics);
    const prompt = this.buildGenerationPrompt(plan);
    const text = await this.generateText(prompt);

    return {
      text: text.trim(),
      topic: plan.topic,
      angle: plan.angle,
    };
  }

  private buildGenerationPrompt(plan: ProactivePostPlan): string {
    const plannerContext = this.planner.buildPromptContext(plan);

    return [
      "Write one Bluesky post for Tech Genie / Genie AI.",
      "The post must be concise, grounded, specific, and free of vague AI hype.",
      "Use the planning context below as the authoritative source for what to say and how to say it.",
      "Do not invent broader claims than the evidence supports.",
      "If the topic is partially directional, phrase it honestly.",
      "Explain what changed or what the design means in practice.",
      "Avoid hashtags.",
      "Avoid em dashes.",
      "Keep it within normal Bluesky post length.",
      "",
      "PLANNING CONTEXT:",
      plannerContext,
      "",
      "OUTPUT REQUIREMENTS:",
      "- one post only",
      "- no bullet list",
      "- no surrounding quotes",
      "- no fake urgency",
      "- no generic startup superlatives",
      "- if there is a claim, make sure the post also implies why it matters",
    ].join("\n");
  }
}
