import { GoogleGenerativeAI } from '@google/generative-ai';

export type BlueskyTopicLane = 'ai' | 'memory' | 'tech';

export interface PlannedBlueskyPost {
  text: string;
  topics: string[];
  ctaMode: 'auto' | 'site' | 'donation' | 'none';
  lane: BlueskyTopicLane;
}

const LANE_ROTATION: BlueskyTopicLane[] = ['ai', 'memory', 'tech'];

const LANE_BRIEFS: Record<BlueskyTopicLane, string> = {
  ai: 'Post about AI, agents, LLM behavior, or practical model usage. Be useful, opinionated, and specific.',
  memory: 'Post about memory-native apps, persistent context, knowledge graphs, retrieval, or software that remembers.',
  tech: 'Post about tech news, dev tools, SaaS infrastructure, or noteworthy product engineering trends.',
};

function chooseLane(date = new Date()): BlueskyTopicLane {
  const dayIndex = Math.floor(date.getTime() / (1000 * 60 * 60 * 6));
  return LANE_ROTATION[dayIndex % LANE_ROTATION.length];
}

function buildPrompt(lane: BlueskyTopicLane): string {
  return [
    'Write one original Bluesky post for Tech Genie.',
    LANE_BRIEFS[lane],
    'Constraints:',
    '- Max 220 characters before any optional CTA logic downstream',
    '- No hashtags',
    '- No em dashes',
    '- Sound sharp, helpful, and human',
    '- Do not mention gen1e.xyz unless the post is directly relevant to AI or memory-native product thinking',
    '- Do not ask for donations by default',
    '- Return plain text only',
  ].join('\n');
}

async function generateWithGemini(prompt: string): Promise<string> {
  const apiKey = process.env.BLUESKY_GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('[ProactivePostPlanner] Missing BLUESKY_GEMINI_API_KEY or GOOGLE_API_KEY');
  }

  const gemini = new GoogleGenerativeAI(apiKey);
  const model = gemini.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 120, temperature: 0.9 },
  });

  return result.response.text().trim();
}

function inferTopicsFromLane(lane: BlueskyTopicLane): string[] {
  switch (lane) {
    case 'ai':
      return ['ai'];
    case 'memory':
      return ['memory', 'ai'];
    case 'tech':
      return ['tech'];
  }
}

export async function planProactiveBlueskyPost(): Promise<PlannedBlueskyPost> {
  const lane = chooseLane();
  const prompt = buildPrompt(lane);
  const text = await generateWithGemini(prompt);

  return {
    text,
    topics: inferTopicsFromLane(lane),
    ctaMode: lane === 'tech' ? 'none' : 'auto',
    lane,
  };
}
