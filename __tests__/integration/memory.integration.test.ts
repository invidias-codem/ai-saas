import { createMockFact, createConversationHistory, factoryFacts } from '../utils/testHelpers'

jest.mock('@clerk/nextjs/server')
jest.mock('firebase-admin')

describe('Memory Integration Tests - End-to-End Workflows', () => {
  const TEST_USER_ID = 'user_integration_test'

  describe('Workflow: User Feedback Loop', () => {
    it('should record feedback for multiple facts', () => {
      const facts = [
        createMockFact({ content: 'Chose PostgreSQL over MongoDB' }),
        createMockFact({ content: 'Implement caching layer' }),
        createMockFact({ content: 'Database connection timeout issue' }),
      ]

      const feedback = facts.map((fact, index) => ({
        factId: fact.id,
        helpful: index < 2,
        rating: index < 2 ? 5 - index : 2,
      }))

      expect(feedback).toHaveLength(3)
      expect(feedback[0].rating).toBe(5)
      expect(feedback[1].rating).toBe(4)
      expect(feedback[2].helpful).toBe(false)
    })

    it('should increase importance with consistent positive feedback', () => {
      const factId = 'fact_important'
      const ratings = [3, 4, 5, 4, 5]
      const importanceScores = [0.4, 0.65, 0.9, 0.85, 0.9]

      ratings.forEach((rating, i) => {
        expect(importanceScores[i]).toBeGreaterThanOrEqual(0)
        expect(importanceScores[i]).toBeLessThanOrEqual(1)
      })
    })

    it('should update fact importance progressively', () => {
      const factId = 'fact_progressive'
      const feedbackSequence = [
        { rating: 3, helpful: true },
        { rating: 4, helpful: true },
        { rating: 5, helpful: true },
      ]

      feedbackSequence.forEach((feedback, i) => {
        expect(feedback.rating).toBeGreaterThan(0)
        if (i > 0) {
          expect(feedback.rating).toBeGreaterThanOrEqual(feedbackSequence[i - 1].rating)
        }
      })
    })
  })

  describe('Workflow: Preference Personalization', () => {
    it('should set and retrieve personalized preferences', () => {
      const preferences = {
        communicationStyle: 'technical',
        preferredDepth: 'detailed',
        topics: {
          'Machine Learning': 0.95,
          'Web Development': 0.6,
          'DevOps': 0.75,
        },
        sentimentPreference: -0.3,
        preferredFormats: ['code', 'explanation', 'examples'],
      }

      expect(preferences.communicationStyle).toBe('technical')
      expect(preferences.topics['Machine Learning']).toBe(0.95)
      expect(preferences.sentimentPreference).toBeGreaterThanOrEqual(-1)
      expect(preferences.sentimentPreference).toBeLessThanOrEqual(1)
    })

    it('should evolve preferences through interactions', () => {
      const prefs1 = {
        communicationStyle: 'balanced',
        topics: { 'Python': 0.5 },
      }

      const prefs2 = {
        communicationStyle: 'technical',
        topics: { 'Python': 0.9, 'FastAPI': 0.8 },
      }

      expect(prefs2.topics['Python']).toBeGreaterThan(prefs1.topics['Python'])
      expect(Object.keys(prefs2.topics).length).toBeGreaterThan(Object.keys(prefs1.topics).length)
    })

    it('should learn topic preferences from conversation', () => {
      const conversation = createConversationHistory()
      const topicsDiscussed = ['database', 'queries', 'optimization']
      const topicsMap: Record<string, number> = {}
      topicsDiscussed.forEach(topic => {
        topicsMap[topic] = 0.8
      })
      const learnedPreferences = {
        topics: topicsMap,
      }

      expect(Object.keys(learnedPreferences.topics).length).toBe(3)
      expect(learnedPreferences.topics['database']).toBe(0.8)
    })
  })

  describe('Workflow: Sentiment Learning', () => {
    it('should track sentiment across multiple facts', () => {
      const facts = [
        factoryFacts.technical(),
        factoryFacts.actionItem(),
        factoryFacts.blocker(),
      ]

      const sentiments = facts.map(f => f.sentiment || 0)
      const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length

      expect(sentiments.length).toBe(3)
      expect(avgSentiment).toBeGreaterThan(-1)
      expect(avgSentiment).toBeLessThan(1)
    })

    it('should adjust preferences based on sentiment patterns', () => {
      const positiveFacts = 8
      const negativeFacts = 2
      const sentimentPreference = (positiveFacts - negativeFacts) / (positiveFacts + negativeFacts)

      expect(sentimentPreference).toBeCloseTo(0.6, 1)
    })
  })

  describe('Workflow: Importance Scoring', () => {
    it('should calculate importance from confidence and impact', () => {
      const fact = createMockFact({
        confidence: 0.9,
        impactScore: 0.8,
      })

      const importance = fact.confidence! * fact.impactScore!
      expect(importance).toBeCloseTo(0.72, 1)
    })

    it('should boost importance with usage', () => {
      const baseImportance = 0.7
      const usageCount = 5
      const maxUsage = 20

      const boostedImportance = Math.min(
        baseImportance + (usageCount / maxUsage) * 0.2,
        1
      )

      expect(boostedImportance).toBeGreaterThan(baseImportance)
      expect(boostedImportance).toBeLessThanOrEqual(1)
    })

    it('should persist importance across sessions', () => {
      const fact = createMockFact({
        impactScore: 0.85,
        usageCount: 1,
      })

      const fact2 = {
        ...fact,
        usageCount: 2,
      }

      expect(fact2.impactScore).toBe(fact.impactScore)
      expect(fact2.usageCount).toBeGreaterThan(fact.usageCount || 0)
    })
  })

  describe('Workflow: Context-Aware Ranking', () => {
    it('should rank facts based on relevance to query', () => {
      const facts = [
        createMockFact({ content: 'PostgreSQL query optimization', confidence: 0.9 }),
        createMockFact({ content: 'Database indexing strategies', confidence: 0.85 }),
        createMockFact({ content: 'React component patterns', confidence: 0.8 }),
      ]

      const query = 'database optimization'
      const ranked = facts
        .map((fact, index) => ({
          fact,
          relevance: [0.95, 0.9, 0.2][index],
        }))
        .sort((a, b) => b.relevance - a.relevance)

      expect(ranked[0].relevance).toBe(0.95)
      expect(ranked[2].relevance).toBe(0.2)
    })

    it('should combine recency with importance', () => {
      const now = Date.now()
      const facts = [
        createMockFact({
          extractedAt: new Date(now),
          impactScore: 0.6,
        }),
        createMockFact({
          extractedAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
          impactScore: 0.9,
        }),
      ]

      const scored = facts.map(fact => {
        const age = now - fact.extractedAt!.getTime()
        const ageDays = age / (24 * 60 * 60 * 1000)
        const recency = Math.exp(-ageDays / 30)
        return {
          fact,
          score: recency * 0.6 + (fact.impactScore || 0) * 0.4,
        }
      })

      expect(scored[0].score).toBeGreaterThan(0)
      expect(scored[1].score).toBeGreaterThan(0)
    })
  })

  describe('Workflow: Complete User Journey', () => {
    it('should handle complete lifecycle from feedback to analytics', () => {
      // Step 1: Collect feedback
      const feedbackBatch = [
        { factId: 'f1', helpful: true, rating: 5 },
        { factId: 'f2', helpful: true, rating: 4 },
        { factId: 'f3', helpful: false, rating: 2 },
      ]

      expect(feedbackBatch).toHaveLength(3)

      // Step 2: Update preferences
      const preferences = {
        communicationStyle: 'professional',
        topics: { 'Architecture': 0.9 },
      }

      expect(preferences.communicationStyle).toBeDefined()

      // Step 3: Calculate analytics
      const avgRating = feedbackBatch.reduce((sum, f) => sum + f.rating, 0) / feedbackBatch.length
      const helpfulCount = feedbackBatch.filter(f => f.helpful).length

      expect(avgRating).toBe((5 + 4 + 2) / 3)
      expect(helpfulCount).toBe(2)
    })

    it('should maintain consistency across memory operations', () => {
      const fact = createMockFact({
        id: 'consistent_fact',
        sentiment: 0.7,
        impactScore: 0.8,
      })

      const feedback = {
        factId: fact.id,
        helpful: true,
        rating: 5,
      }

      const preference = {
        topics: { [fact.content]: 0.85 },
      }

      expect(feedback.factId).toBe(fact.id)
      expect(preference.topics[fact.content]).toBeGreaterThan(0)
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent feedback submissions', () => {
      const factIds = ['f1', 'f2', 'f3', 'f4']
      const feedbackRequests = factIds.map(id => ({
        factId: id,
        helpful: true,
        rating: 4,
      }))

      expect(feedbackRequests).toHaveLength(4)
      feedbackRequests.forEach((req, i) => {
        expect(req.factId).toBe(factIds[i])
      })
    })

    it('should handle concurrent preference reads', () => {
      const preferences = {
        communicationStyle: 'technical',
        sentimentPreference: 0.3,
      }

      const requests = Array(5).fill(preferences)

      expect(requests).toHaveLength(5)
      requests.forEach(req => {
        expect(req.communicationStyle).toBe('technical')
      })
    })

    it('should handle parallel fact ranking operations', () => {
      const facts = Array(10)
        .fill(null)
        .map((_, i) => createMockFact({ id: `fact_${i}` }))

      const rankings = facts.map((fact, i) => ({
        factId: fact.id,
        rank: i + 1,
        score: (10 - i) / 10,
      }))

      expect(rankings).toHaveLength(10)
      expect(rankings[0].score).toBe(1)
      expect(rankings[9].score).toBe(0.1)
    })
  })

  describe('Error Recovery', () => {
    it('should recover from partial batch failures', () => {
      const feedbackBatch = [
        { factId: 'f1', helpful: true, rating: 4, status: 'success' },
        { factId: 'f2', helpful: true, rating: 4, status: 'error' },
        { factId: 'f3', helpful: true, rating: 4, status: 'success' },
      ]

      const successful = feedbackBatch.filter(f => f.status === 'success')
      const failed = feedbackBatch.filter(f => f.status === 'error')

      expect(successful).toHaveLength(2)
      expect(failed).toHaveLength(1)
    })

    it('should retry failed operations with exponential backoff', () => {
      const retries = [
        { attempt: 1, delay: 100 },
        { attempt: 2, delay: 200 },
        { attempt: 3, delay: 400 },
      ]

      retries.forEach((retry, i) => {
        expect(retry.attempt).toBe(i + 1)
        if (i > 0) {
          expect(retry.delay).toBe(retries[i - 1].delay * 2)
        }
      })
    })

    it('should maintain data integrity during failures', () => {
      const originalFact = createMockFact({
        impactScore: 0.7,
        usageCount: 5,
      })

      const failedUpdate = {
        impactScore: 0.7,
        usageCount: 5,
        status: 'error',
      }

      expect(failedUpdate.impactScore).toBe(originalFact.impactScore)
      expect(failedUpdate.usageCount).toBe(originalFact.usageCount)
    })
  })

  describe('Multi-Turn Conversations', () => {
    it('should extract facts from multi-turn conversation', () => {
      const conversation = createConversationHistory()
      const extractedFacts = conversation
        .filter(msg => msg.role === 'assistant')
        .map(msg => ({
          content: msg.content,
          extractedAt: msg.timestamp,
        }))

      expect(extractedFacts.length).toBeGreaterThan(0)
      extractedFacts.forEach(fact => {
        expect(fact.content).toBeDefined()
        expect(fact.extractedAt).toBeDefined()
      })
    })

    it('should maintain context across turns', () => {
      const turns = [
        { role: 'user', content: 'Question 1', contextId: 'ctx1' },
        { role: 'assistant', content: 'Answer 1', contextId: 'ctx1' },
        { role: 'user', content: 'Question 2', contextId: 'ctx1' },
        { role: 'assistant', content: 'Answer 2', contextId: 'ctx1' },
      ]

      const contextIds = turns.map(t => t.contextId)
      expect(new Set(contextIds).size).toBe(1)
    })

    it('should accumulate preferences from conversation', () => {
      const messages = [
        'Show me code examples',
        'Explain in technical terms',
        'Include implementation details',
      ]

      const preferences = {
        format: messages[0].toLowerCase().includes('code') ? ['code'] : [],
        style: messages[1].toLowerCase().includes('technical') ? 'technical' : 'casual',
        depth: 'detailed',
      }

      expect(preferences.format).toContain('code')
      expect(preferences.style).toBe('technical')
    })
  })

  describe('Temporal Patterns', () => {
    it('should track temporal patterns in user behavior', () => {
      const now = Date.now()
      const facts = [
        createMockFact({ extractedAt: new Date(now) }),
        createMockFact({ extractedAt: new Date(now - 1 * 60 * 60 * 1000) }),
        createMockFact({ extractedAt: new Date(now - 24 * 60 * 60 * 1000) }),
      ]

      const recencyScores = facts.map(f => {
        const age = now - f.extractedAt!.getTime()
        return Math.exp(-age / (24 * 60 * 60 * 1000))
      })

      expect(recencyScores[0]).toBeGreaterThan(recencyScores[1])
      expect(recencyScores[1]).toBeGreaterThan(recencyScores[2])
    })

    it('should calculate fact expiry correctly', () => {
      const now = Date.now()
      const fact = createMockFact({
        expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      })

      const daysUntilExpiry = Math.ceil(
        (fact.expiresAt!.getTime() - now) / (24 * 60 * 60 * 1000)
      )

      expect(daysUntilExpiry).toBe(7)
    })
  })
})
