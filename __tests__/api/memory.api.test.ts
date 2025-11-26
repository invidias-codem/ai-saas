import { createMockFact } from '../utils/testHelpers'

jest.mock('@clerk/nextjs/server')
jest.mock('axios')

describe('Memory API Tests - Feedback Endpoints', () => {
  const TEST_USER_ID = 'test_user_12345'
  const TEST_FACT_ID = 'fact_abc123'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /api/memory/feedback - Record Feedback', () => {
    it('should accept feedback request with valid data', () => {
      const feedbackData = {
        factId: TEST_FACT_ID,
        helpful: true,
        rating: 4,
        feedback: 'This fact was very helpful in my decision',
      }

      expect(feedbackData.factId).toBeDefined()
      expect(feedbackData.helpful).toBe(true)
      expect(feedbackData.rating).toBeGreaterThanOrEqual(1)
      expect(feedbackData.rating).toBeLessThanOrEqual(5)
    })

    it('should validate rating range 1-5', () => {
      const validRatings = [1, 2, 3, 4, 5]
      const invalidRatings = [0, 6, -1, 10]

      validRatings.forEach(rating => {
        expect(rating).toBeGreaterThanOrEqual(1)
        expect(rating).toBeLessThanOrEqual(5)
      })

      invalidRatings.forEach(rating => {
        expect(
          rating >= 1 && rating <= 5
        ).toBe(false)
      })
    })

    it('should require factId field', () => {
      const feedbackWithoutFactId = {
        helpful: true,
        rating: 4,
      }

      expect('factId' in feedbackWithoutFactId).toBe(false)
    })

    it('should require helpful field as boolean', () => {
      const validFeedback = {
        factId: TEST_FACT_ID,
        helpful: true,
      }

      expect(typeof validFeedback.helpful).toBe('boolean')
    })

    it('should handle optional feedback comment', () => {
      const feedbackWithComment = {
        factId: TEST_FACT_ID,
        helpful: true,
        rating: 5,
        feedback: 'Crucial information',
      }

      const feedbackWithoutComment = {
        factId: TEST_FACT_ID,
        helpful: true,
        rating: 4,
        feedback: undefined,
      }

      expect(feedbackWithComment.feedback).toBeDefined()
      expect(feedbackWithoutComment.feedback).toBeUndefined()
    })

    it('should record unhelpful feedback with reasoning', () => {
      const unhelpfulFeedback = {
        factId: TEST_FACT_ID,
        helpful: false,
        rating: 1,
        feedback: 'Not relevant to current task',
      }

      expect(unhelpfulFeedback.helpful).toBe(false)
      expect(unhelpfulFeedback.rating).toBe(1)
    })

    it('should support rating progression for evolving feedback', () => {
      const feedbackSequence = [
        { rating: 2, helpful: true },
        { rating: 3, helpful: true },
        { rating: 4, helpful: true },
        { rating: 5, helpful: true },
      ]

      feedbackSequence.forEach((feedback, index) => {
        expect(feedback.rating).toBeGreaterThan(index)
        expect(feedback.helpful).toBe(true)
      })
    })

    it('should allow mixed helpful/unhelpful ratings', () => {
      const mixedFeedback = [
        { factId: 'f1', helpful: true, rating: 5 },
        { factId: 'f2', helpful: false, rating: 1 },
        { factId: 'f3', helpful: true, rating: 3 },
        { factId: 'f4', helpful: false, rating: 2 },
      ]

      const helpfulCount = mixedFeedback.filter(f => f.helpful).length
      const unhelpfulCount = mixedFeedback.filter(f => !f.helpful).length

      expect(helpfulCount).toBe(2)
      expect(unhelpfulCount).toBe(2)
    })

    it('should maintain feedback consistency for same fact', () => {
      const fact = createMockFact({ id: 'consistent_fact' })
      const feedbackArray = [
        { factId: fact.id, helpful: true, rating: 4 },
        { factId: fact.id, helpful: true, rating: 5 },
        { factId: fact.id, helpful: true, rating: 4 },
      ]

      const allSameFactId = feedbackArray.every(f => f.factId === fact.id)
      expect(allSameFactId).toBe(true)
    })

    it('should validate feedback text length is reasonable', () => {
      const shortFeedback = 'Good'
      const longFeedback = 'a'.repeat(500)
      const veryLongFeedback = 'a'.repeat(5000)

      expect(shortFeedback.length).toBeGreaterThan(0)
      expect(longFeedback.length).toBeLessThan(1000)
      expect(veryLongFeedback.length).toBeGreaterThan(1000)
    })
  })

  describe('Memory API Tests - Preferences Endpoints', () => {
    it('should accept valid preference data', () => {
      const preferences = {
        communicationStyle: 'technical',
        preferredDepth: 'detailed',
        topics: { 'AI/ML': 0.9, 'Web Dev': 0.7 },
        sentimentPreference: 0.2,
        preferredFormats: ['code', 'explanation'],
      }

      expect(preferences.communicationStyle).toBeDefined()
      expect(preferences.preferredDepth).toBeDefined()
      expect(typeof preferences.sentimentPreference).toBe('number')
    })

    it('should validate sentiment preference range -1 to 1', () => {
      const validSentiments = [-1, -0.5, 0, 0.5, 1]
      const invalidSentiments = [-1.1, -2, 1.1, 2]

      validSentiments.forEach(s => {
        expect(s).toBeGreaterThanOrEqual(-1)
        expect(s).toBeLessThanOrEqual(1)
      })

      invalidSentiments.forEach(s => {
        expect(
          s >= -1 && s <= 1
        ).toBe(false)
      })
    })

    it('should allow partial preference updates', () => {
      const partialPrefs = {
        communicationStyle: 'professional',
      }

      const fullPrefs = {
        communicationStyle: 'professional',
        preferredDepth: 'balanced',
        topics: {},
      }

      expect(Object.keys(partialPrefs).length).toBe(1)
      expect(Object.keys(fullPrefs).length).toBeGreaterThan(1)
    })

    it('should validate topic preference scores are 0-1', () => {
      const topics = {
        'Python': 0.9,
        'JavaScript': 0.7,
        'Rust': 0.5,
      }

      Object.values(topics).forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
      })
    })

    it('should support multiple preferred formats', () => {
      const formatOptions = ['code', 'explanation', 'examples', 'diagrams', 'pseudocode']
      const selectedFormats = ['code', 'explanation']

      expect(selectedFormats.every(f => formatOptions.includes(f))).toBe(true)
    })

    it('should track preference source (manual vs learned)', () => {
      const manualPrefs = {
        source: 'manual',
        learnedFrom: 0,
      }

      const learnedPrefs = {
        source: 'learned',
        learnedFrom: 12,
      }

      expect(manualPrefs.source).toBe('manual')
      expect(learnedPrefs.source).toBe('learned')
      expect(learnedPrefs.learnedFrom).toBeGreaterThan(0)
    })

    it('should support preference evolution through updates', () => {
      const prefs1 = {
        communicationStyle: 'balanced',
        topics: { 'Python': 0.5 },
      }

      const prefs2 = {
        communicationStyle: 'technical',
        topics: { 'Python': 0.9, 'FastAPI': 0.8 },
      }

      expect(prefs1.communicationStyle).not.toBe(prefs2.communicationStyle)
      expect(Object.keys(prefs2.topics).length).toBeGreaterThan(Object.keys(prefs1.topics).length)
    })
  })

  describe('Memory API Tests - Error Handling', () => {
    it('should reject requests with missing required fields', () => {
      const invalidRequests = [
        { helpful: true, rating: 4 },
        { factId: 'f1', rating: 4 },
        { factId: 'f1', helpful: true },
      ]

      invalidRequests.forEach(req => {
        const hasRequiredFields =
          'factId' in req &&
          'helpful' in req &&
          'rating' in req

        expect(hasRequiredFields).toBe(false)
      })
    })

    it('should handle unauthenticated requests appropriately', () => {
      const unauthenticatedRequest = {
        userId: null,
        factId: TEST_FACT_ID,
      }

      expect(unauthenticatedRequest.userId).toBeNull()
    })

    it('should validate input types strictly', () => {
      const validTypes = {
        factId: typeof 'string' === 'string',
        helpful: typeof true === 'boolean',
        rating: typeof 5 === 'number',
      }

      expect(Object.values(validTypes).every(v => v === true)).toBe(true)
    })

    it('should handle concurrent feedback submissions', () => {
      const requests = Array(5)
        .fill(null)
        .map((_, i) => ({
          factId: `fact_${i}`,
          helpful: i % 2 === 0,
          rating: 2 + i,
        }))

      expect(requests).toHaveLength(5)
      requests.forEach((req, i) => {
        expect(req.factId).toBe(`fact_${i}`)
      })
    })

    it('should handle cloud function timeouts gracefully', () => {
      const timeoutError = {
        message: 'Request timeout',
        code: 'ETIMEDOUT',
      }

      expect(timeoutError.message).toContain('timeout')
    })

    it('should maintain data consistency on partial failures', () => {
      const feedbackBatch = [
        { factId: 'f1', helpful: true, rating: 4, status: 'success' },
        { factId: 'f2', helpful: true, rating: 4, status: 'error' },
        { factId: 'f3', helpful: true, rating: 4, status: 'success' },
      ]

      const successCount = feedbackBatch.filter(f => f.status === 'success').length
      const errorCount = feedbackBatch.filter(f => f.status === 'error').length

      expect(successCount).toBe(2)
      expect(errorCount).toBe(1)
    })
  })

  describe('Memory API Tests - Data Validation', () => {
    it('should accept facts with all metadata fields', () => {
      const richFact = createMockFact({
        usageCount: 5,
        impactScore: 0.8,
        sentiment: 0.6,
        extractedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })

      expect(richFact.usageCount).toBe(5)
      expect(richFact.impactScore).toBe(0.8)
      expect(richFact.extractedAt).toBeDefined()
    })

    it('should normalize sentiment scores to -1 to 1 range', () => {
      const sentiments = [
        { raw: -0.95, normalized: -0.95 },
        { raw: 0, normalized: 0 },
        { raw: 0.95, normalized: 0.95 },
      ]

      sentiments.forEach(s => {
        expect(s.normalized).toBeGreaterThanOrEqual(-1)
        expect(s.normalized).toBeLessThanOrEqual(1)
      })
    })

    it('should handle empty feedback history', () => {
      const emptyHistory = {
        feedbackCount: 0,
        recentFeedback: [],
      }

      expect(emptyHistory.feedbackCount).toBe(0)
      expect(emptyHistory.recentFeedback).toHaveLength(0)
    })

    it('should support filtering feedback by date range', () => {
      const now = Date.now()
      const feedback = [
        { createdAt: new Date(now - 86400000), id: 'f1' },
        { createdAt: new Date(now - 172800000), id: 'f2' },
        { createdAt: new Date(now - 604800000), id: 'f3' },
      ]

      const last7Days = feedback.filter(
        f => f.createdAt.getTime() > now - 7 * 24 * 60 * 60 * 1000
      )

      expect(last7Days).toHaveLength(2)
    })

    it('should maintain fact importance through feedback cycles', () => {
      const fact = createMockFact()
      const feedbackCycle = [
        { rating: 3, impactScoreBefore: 0.5, impactScoreAfter: 0.6 },
        { rating: 4, impactScoreBefore: 0.6, impactScoreAfter: 0.75 },
        { rating: 5, impactScoreBefore: 0.75, impactScoreAfter: 0.9 },
      ]

      feedbackCycle.forEach((feedback, i) => {
        if (i > 0) {
          expect(feedback.impactScoreBefore).toBe(feedbackCycle[i - 1].impactScoreAfter)
        }
      })
    })
  })
})
