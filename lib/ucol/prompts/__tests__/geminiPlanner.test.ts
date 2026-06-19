import { generatePlan } from '../geminiPlanner';
import type { ContextPackage } from '../../types';

const validPlan = {
  appName: 'Fallback App',
  description: 'A test app planned by fallback provider.',
  techStack: ['Next.js', 'TypeScript', 'Tailwind CSS', 'React'],
  pages: [
    { name: 'Home', route: '/', description: 'Home page', components: ['HomePage'] },
  ],
  components: [
    {
      name: 'HomePage',
      filePath: 'app/page.tsx',
      description: 'Main page',
      props: [],
      dependencies: [],
      priority: 0,
    },
  ],
  dataModel: [],
  apiRoutes: [],
  reasoning: 'Fallback planner produced a minimal valid app.',
};

const openAiCreateMock = jest.fn();
const anthropicCreateMock = jest.fn();
const geminiGenerateContentMock = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: openAiCreateMock,
      },
    },
  }));
});

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: anthropicCreateMock,
    },
  }));
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: geminiGenerateContentMock,
    }),
  })),
}));

function makeContext(): ContextPackage {
  return {
    source: 'user',
    target: 'gemini',
    payload: {
      type: 'plan',
      content: {
        prompt: 'Build a simple app',
        userId: 'test-user',
        availableDependencies: ['next', 'react', 'tailwindcss'],
      },
      reasoning: 'test',
      relevanceScore: 1,
    },
    timestamp: Date.now(),
    sessionId: 'test-session',
  };
}

describe('generatePlan provider fallback', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-openai-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      GOOGLE_API_KEY: 'test-google-key',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('falls back to Anthropic planning before Gemini when OpenAI fails', async () => {
    openAiCreateMock.mockRejectedValueOnce(new Error('OpenAI temporarily unavailable'));
    anthropicCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(validPlan) }],
    });
    geminiGenerateContentMock.mockRejectedValueOnce(
      new Error('[GoogleGenerativeAI Error]: [403 Forbidden] unrestricted keys')
    );

    const plan = await generatePlan(makeContext());

    expect(plan.appName).toBe('Fallback App');
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
    expect(geminiGenerateContentMock).not.toHaveBeenCalled();
  });
});
