import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { ClaudeProvider } from '@/lib/llm/providers/claude';
import { DeepSeekProvider } from '@/lib/llm/providers/deepseek';
import { UserProfile } from '@/lib/agents/profileBuilder';
import { ExtractedFact } from '@/lib/agents/factExtractor';

export type MemoryTask = 'extract' | 'synthesize' | 'profile';

export interface MemoryTaskPayload {
  // For 'extract' task
  userQuery?: string;
  assistantResponse?: string;
  
  // For 'synthesize' task  
  facts?: ExtractedFact[];
  query?: string;
  
  // For 'profile' task
  conversations?: Array<{
    id: string;
    title: string;
    summary: string;
    created_at: string;
  }>;
}

export interface MemoryRouterResult {
  provider: string;
  model: string;
  result: any;
  reasoning?: string;
}

/**
 * UCOL-Style Memory Router
 * 
 * Routes memory processing tasks to the most appropriate model:
 * - Gemini Flash: Fast fact retrieval and embedding generation
 * - DeepSeek: Context synthesis when in reasoning mode
 * - Claude: Nuanced user profile generation
 */
export class MemoryRouter {
  private geminiProvider: GeminiProvider;
  private claudeProvider: ClaudeProvider;
  private deepSeekProvider: DeepSeekProvider;

  constructor() {
    this.geminiProvider = new GeminiProvider();
    this.claudeProvider = new ClaudeProvider();
    this.deepSeekProvider = new DeepSeekProvider();
  }

  /**
   * Routes a memory task to the appropriate provider
   */
  async routeMemoryTask(
    task: MemoryTask,
    payload: MemoryTaskPayload,
    options: { 
      preferReasoning?: boolean;
      requireNuance?: boolean;
      prioritizeSpeed?: boolean;
    } = {}
  ): Promise<MemoryRouterResult> {
    
    try {
      switch (task) {
        case 'extract':
          return await this.routeExtractionTask(payload, options);
          
        case 'synthesize':
          return await this.routeSynthesisTask(payload, options);
          
        case 'profile':
          return await this.routeProfileTask(payload, options);
          
        default:
          throw new Error(`Unknown memory task: ${task}`);
      }
    } catch (error) {
      console.error(`[MemoryRouter] Error routing ${task} task:`, error);
      throw error;
    }
  }

  /**
   * Routes fact extraction tasks - defaults to Gemini Flash for speed
   */
  private async routeExtractionTask(
    payload: MemoryTaskPayload,
    options: { prioritizeSpeed?: boolean }
  ): Promise<MemoryRouterResult> {
    
    if (!payload.userQuery || !payload.assistantResponse) {
      throw new Error('Extract task requires userQuery and assistantResponse');
    }

    // Always use Gemini Flash for extraction - optimized for speed and structured output
    const systemPrompt = `You are a fact extraction agent. Analyze the conversation between a user and an AI assistant to extract structured facts about the user.

Extract facts in these categories:
- skill: Technical abilities, languages, frameworks
- preference: Likes, dislikes, preferred ways of working  
- goal: Objectives, targets, things they want to achieve
- personal: Personal information, background
- project: Current or past projects they mention
- tool: Software, services, platforms they use

For each fact, assign a confidence score (0.0-1.0).

Return ONLY a valid JSON array of facts:
[{"type": "skill", "value": "React development", "confidence": 0.95}]`;

    const conversationText = `User: ${payload.userQuery}\n\nAssistant: ${payload.assistantResponse}`;
    
    const result = await this.geminiProvider.generateStream(
      [{ role: 'user', text: conversationText }],
      systemPrompt,
      {
        model: "gemini-2.0-flash",
        temperature: 0.1,
        maxTokens: 2048
      }
    );

    const response = await this.streamToString(result.stream);

    return {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      result: response,
      reasoning: 'Selected Gemini Flash for fast, structured fact extraction'
    };
  }

  /**
   * Routes context synthesis tasks - uses DeepSeek for reasoning, Gemini for standard
   */
  private async routeSynthesisTask(
    payload: MemoryTaskPayload,
    options: { preferReasoning?: boolean; prioritizeSpeed?: boolean }
  ): Promise<MemoryRouterResult> {
    
    if (!payload.facts || !payload.query) {
      throw new Error('Synthesize task requires facts and query');
    }

    // Use DeepSeek for reasoning mode, Gemini Flash for standard
    if (options.preferReasoning) {
      const systemPrompt = `You are a context synthesis agent using reasoning to analyze user memories and extract relevant insights.

Given a set of facts about a user and their current query, synthesize the most relevant context that would help personalize a response.

Focus on:
1. Direct relevance to the current query
2. Patterns and connections between facts
3. User preferences and goals that should influence the response
4. Missing information that might be useful to note

Provide a concise, well-reasoned summary of the relevant context.`;

      const factsText = payload.facts.map(f => 
        `${f.type}: ${f.value} (confidence: ${f.confidence})`
      ).join('\n');

      const userMessage = `Current Query: ${payload.query}\n\nUser Facts:\n${factsText}\n\nSynthesize relevant context:`;

      const result = await this.deepSeekProvider.generateStream(
        [{ role: 'user', text: userMessage }],
        systemPrompt,
        {
          model: "deepseek-r1",
          temperature: 0.7,
          maxTokens: 1024
        }
      );

      const response = await this.streamToString(result.stream);

      return {
        provider: 'deepseek',
        model: 'deepseek-r1',
        result: response,
        reasoning: 'Selected DeepSeek R1 for reasoning-based context synthesis'
      };

    } else {
      // Use Gemini Flash for fast synthesis
      const systemPrompt = `Analyze user facts and synthesize relevant context for their query. Be concise and focus on the most relevant information.`;

      const factsText = payload.facts.map(f => `${f.type}: ${f.value}`).join('\n');
      const userMessage = `Query: ${payload.query}\n\nFacts:\n${factsText}`;

      const result = await this.geminiProvider.generateStream(
        [{ role: 'user', text: userMessage }],
        systemPrompt,
        {
          model: "gemini-2.0-flash",
          temperature: 0.5,
          maxTokens: 512
        }
      );

      const response = await this.streamToString(result.stream);

      return {
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        result: response,
        reasoning: 'Selected Gemini Flash for fast context synthesis'
      };
    }
  }

  /**
   * Routes profile generation tasks - uses Claude for nuanced profiles, Gemini for speed
   */
  private async routeProfileTask(
    payload: MemoryTaskPayload,
    options: { requireNuance?: boolean; prioritizeSpeed?: boolean }
  ): Promise<MemoryRouterResult> {
    
    if (!payload.conversations) {
      throw new Error('Profile task requires conversations');
    }

    const conversationContext = payload.conversations.map(conv => 
      `Conversation (${conv.created_at}): ${conv.title}\nSummary: ${conv.summary}`
    ).join('\n\n');

    // Use Claude for nuanced profile generation when requested
    if (options.requireNuance) {
      const systemPrompt = `You are analyzing user conversations to build a comprehensive, nuanced user profile. Your goal is to create a rich, personalized understanding of this user that goes beyond just facts.

Analyze the conversations and create both:
1. A structured profile with the required fields
2. A narrative profile that captures the user's personality, working style, and unique characteristics

For the structured profile, extract:
- Industry they work in
- Their professional role  
- Skills they possess or mention
- Tools/software they use
- Goals they're working toward
- Communication style (how they prefer to interact)
- Interests (professional or personal)

Then create a brief narrative profile (2-3 sentences) that captures their essence - their personality, approach to work, and unique traits that would help personalize future interactions.

Return as JSON with both "structured" and "narrative" fields.`;

      const result = await this.claudeProvider.generateStream(
        [{ role: 'user', text: `Analyze these conversations to build a nuanced user profile:\n\n${conversationContext}` }],
        systemPrompt,
        {
          model: "claude-sonnet-4-5-20250929", 
          temperature: 0.6,
          maxTokens: 2048
        }
      );

      const response = await this.streamToString(result.stream);

      return {
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        result: response,
        reasoning: 'Selected Claude Sonnet for nuanced, personality-rich profile generation'
      };

    } else {
      // Use Gemini Flash for fast structured profile generation
      const systemPrompt = `Analyze user conversations to build a structured user profile. Extract key information and return as JSON.

Return ONLY a valid JSON object with this structure:
{
  "industry": "string",
  "role": "string", 
  "skills": ["array", "of", "strings"],
  "tools": ["array", "of", "strings"],
  "goals": ["array", "of", "strings"],
  "communicationStyle": "string",
  "interests": ["array", "of", "strings"],
  "updatedAt": "${new Date().toISOString()}"
}`;

      const result = await this.geminiProvider.generateStream(
        [{ role: 'user', text: `Analyze these conversations to build a user profile:\n\n${conversationContext}` }],
        systemPrompt,
        {
          model: "gemini-2.0-flash",
          temperature: 0.3,
          maxTokens: 1024
        }
      );

      const response = await this.streamToString(result.stream);

      return {
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        result: response,
        reasoning: 'Selected Gemini Flash for fast structured profile generation'
      };
    }
  }

  /**
   * Helper function to convert stream to string
   */
  private async streamToString(stream: ReadableStream): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }

    return result;
  }
}

/**
 * Convenience function to route memory tasks
 */
export async function routeMemoryTask(
  task: MemoryTask,
  payload: MemoryTaskPayload,
  options?: { 
    preferReasoning?: boolean;
    requireNuance?: boolean;
    prioritizeSpeed?: boolean;
  }
): Promise<MemoryRouterResult> {
  const router = new MemoryRouter();
  return router.routeMemoryTask(task, payload, options);
}