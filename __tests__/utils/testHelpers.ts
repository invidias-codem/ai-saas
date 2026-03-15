import { ExtractedFact } from '@/lib/intelligentMemory'

export function createMockFact(overrides?: Partial<ExtractedFact>): ExtractedFact {
  const id = Math.random().toString(36).substring(7)
  return {
    id: `fact_${id}`,
    type: 'conversation',
    content: 'Test fact content',
    confidence: 0.8,
    sentiment: 0.5,
    impactScore: 0.6,
    extractedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    usageCount: 0,
    scope: 'conversation',
    ...overrides,
  }
}

export function createMockUserPreferences(overrides?: any) {
  return {
    communicationStyle: 'balanced',
    preferredDepth: 'balanced',
    topics: {},
    sentimentPreference: 0,
    preferredFormats: ['text'],
    source: 'learned',
    learnedFrom: 0,
    ...overrides,
  }
}

export function createConversationHistory() {
  return [
    {
      role: 'user',
      content: 'How do I optimize database queries?',
      timestamp: new Date(Date.now() - 3600000),
    },
    {
      role: 'assistant',
      content: 'Use indexes and analyze query plans with EXPLAIN',
      timestamp: new Date(Date.now() - 3500000),
    },
    {
      role: 'user',
      content: 'That really helped me understand the bottleneck!',
      timestamp: new Date(Date.now() - 3400000),
    },
  ]
}

export const positiveConversationExamples = [
  {
    message: 'Excellent explanation, this solved my problem!',
    keywords: ['excellent', 'solved', 'problem'],
  },
  {
    message: 'Great solution, very helpful and clear',
    keywords: ['great', 'helpful', 'clear'],
  },
  {
    message: 'Perfect implementation, works exactly as needed',
    keywords: ['perfect', 'implementation', 'works'],
  },
  {
    message: 'Amazing insights, learned so much',
    keywords: ['amazing', 'insights', 'learned'],
  },
  {
    message: 'Brilliant approach to solving this',
    keywords: ['brilliant', 'approach'],
  },
  {
    message: 'This is fantastic and exactly what I needed',
    keywords: ['fantastic', 'exactly', 'needed'],
  },
  {
    message: 'Love this solution, super effective',
    keywords: ['love', 'solution', 'effective'],
  },
  {
    message: 'Outstanding work, very impressed',
    keywords: ['outstanding', 'impressed'],
  },
  {
    message: 'Wonderful explanation, makes perfect sense',
    keywords: ['wonderful', 'perfect', 'sense'],
  },
]

export const negativeConversationExamples = [
  {
    message: 'This does not work at all',
    keywords: ['does not work'],
  },
  {
    message: 'Terrible explanation, very confusing',
    keywords: ['terrible', 'confusing'],
  },
  {
    message: 'Awful solution, made things worse',
    keywords: ['awful', 'worse'],
  },
  {
    message: 'Horrible approach, completely wrong',
    keywords: ['horrible', 'wrong'],
  },
  {
    message: 'Bad implementation, full of bugs',
    keywords: ['bad', 'bugs'],
  },
  {
    message: 'Useless advice, did not help',
    keywords: ['useless', 'did not help'],
  },
  {
    message: 'Disgusting code quality',
    keywords: ['disgusting'],
  },
  {
    message: 'Pathetic attempt at explaining this',
    keywords: ['pathetic'],
  },
  {
    message: 'Abysmal performance, totally broken',
    keywords: ['abysmal', 'broken'],
  },
]

export function generateVectorSimilarities(factCount: number): Map<string, number> {
  const similarities = new Map<string, number>()
  for (let i = 0; i < factCount; i++) {
    const score = 0.1 + Math.random() * 0.9
    similarities.set(`fact_${i}`, score)
  }
  return similarities
}

export const factoryFacts = {
  technical: () =>
    createMockFact({
      content: 'Implement cursor-based pagination for large datasets',
      type: 'conversation',
      sentiment: 0.7,
      confidence: 0.95,
    }),
  actionItem: () =>
    createMockFact({
      content: 'Add comprehensive error handling to API routes',
      type: 'conversation',
      sentiment: 0.4,
      confidence: 0.85,
    }),
  blocker: () =>
    createMockFact({
      content: 'Database connection timeout during peak hours',
      type: 'conversation',
      sentiment: -0.8,
      confidence: 0.9,
    }),
  preference: () =>
    createMockFact({
      content: 'User prefers detailed technical explanations',
      type: 'preference',
      sentiment: 0.0,
      confidence: 0.75,
      scope: 'user',
    }),
  contextual: () =>
    createMockFact({
      content: 'Building a microservices architecture',
      type: 'conversation',
      sentiment: 0.5,
      confidence: 0.8,
      scope: 'conversation',
    }),
  highConfidence: () =>
    createMockFact({
      confidence: 0.99,
      impactScore: 0.95,
      usageCount: 25,
      sentiment: 0.8,
    }),
  lowConfidence: () =>
    createMockFact({
      confidence: 0.45,
      impactScore: 0.3,
      usageCount: 1,
      sentiment: -0.2,
    }),
  recent: () =>
    createMockFact({
      extractedAt: new Date(),
      usageCount: 5,
      sentiment: 0.6,
    }),
  old: () =>
    createMockFact({
      extractedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      usageCount: 1,
      sentiment: 0.3,
    }),
  expiringSoon: () =>
    createMockFact({
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      usageCount: 8,
      sentiment: 0.7,
    }),
}

export const edgeCaseData = {
  zeroValues: createMockFact({
    confidence: 0,
    sentiment: 0,
    impactScore: 0,
    usageCount: 0,
  }),
  maxValues: createMockFact({
    confidence: 1,
    sentiment: 1,
    impactScore: 1,
    usageCount: 1000,
  }),
  negativeMax: createMockFact({
    sentiment: -1,
    impactScore: 0,
  }),
  veryLongContent: createMockFact({
    content: 'x'.repeat(10000),
  }),
  specialCharacters: createMockFact({
    content: '!@#$%^&*()_+-=[]{}|;:,.<>?/~`',
  }),
  unicode: createMockFact({
    content: 'Testing émojis 🚀 and spëcial chars ñ',
  }),
  nullContent: createMockFact({
    content: '',
  }),
}
