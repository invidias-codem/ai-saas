import { createMockFact, factoryFacts, edgeCaseData } from '../utils/testHelpers'

describe('Memory Analytics Tests - Sentiment & Importance', () => {
  describe('Sentiment Distribution Analysis', () => {
    it('should calculate average sentiment across facts', () => {
      const facts = [
        createMockFact({ sentiment: 0.8 }),
        createMockFact({ sentiment: 0.9 }),
        createMockFact({ sentiment: 0.6 }),
        createMockFact({ sentiment: -0.7 }),
        createMockFact({ sentiment: 0.0 }),
      ]

      const sentiments = facts.map(f => f.sentiment || 0)
      const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length

      expect(avg).toBeCloseTo(0.34, 1)
    })

    it('should categorize sentiments into buckets', () => {
      const facts = [
        createMockFact({ sentiment: 0.95 }),
        createMockFact({ sentiment: 0.5 }),
        createMockFact({ sentiment: 0.0 }),
        createMockFact({ sentiment: -0.5 }),
        createMockFact({ sentiment: -0.95 }),
      ]

      const distribution = {
        veryPositive: facts.filter(f => (f.sentiment || 0) > 0.5).length,
        positive: facts.filter(f => (f.sentiment || 0) > 0 && (f.sentiment || 0) <= 0.5).length,
        neutral: facts.filter(f => (f.sentiment || 0) === 0).length,
        negative: facts.filter(f => (f.sentiment || 0) < 0 && (f.sentiment || 0) >= -0.5).length,
        veryNegative: facts.filter(f => (f.sentiment || 0) < -0.5).length,
      }

      expect(distribution.veryPositive).toBe(1)
      expect(distribution.positive).toBe(1)
      expect(distribution.neutral).toBe(1)
      expect(distribution.negative).toBe(1)
      expect(distribution.veryNegative).toBe(1)
    })

    it('should handle all negative sentiments', () => {
      const facts = [
        createMockFact({ sentiment: -0.9 }),
        createMockFact({ sentiment: -0.8 }),
        createMockFact({ sentiment: -0.7 }),
      ]

      const sentiments = facts.map(f => f.sentiment || 0)
      const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      const allNegative = sentiments.every(s => s < 0)

      expect(avg).toBeCloseTo(-0.8, 1)
      expect(allNegative).toBe(true)
    })

    it('should handle all positive sentiments', () => {
      const facts = [
        createMockFact({ sentiment: 0.7 }),
        createMockFact({ sentiment: 0.8 }),
        createMockFact({ sentiment: 0.9 }),
      ]

      const sentiments = facts.map(f => f.sentiment || 0)
      const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      const allPositive = sentiments.every(s => s > 0)

      expect(avg).toBeCloseTo(0.8, 1)
      expect(allPositive).toBe(true)
    })
  })

  describe('Importance Scoring', () => {
    it('should calculate importance from rating', () => {
      const ratings = [1, 2, 3, 4, 5]
      const importance = ratings.map(r => r / 5)

      expect(importance[0]).toBe(0.2)
      expect(importance[2]).toBe(0.6)
      expect(importance[4]).toBe(1.0)
    })

    it('should adjust importance with usage frequency', () => {
      const facts = [
        createMockFact({ usageCount: 1, impactScore: 0.5 }),
        createMockFact({ usageCount: 5, impactScore: 0.6 }),
        createMockFact({ usageCount: 15, impactScore: 0.7 }),
      ]

      const adjusted = facts.map(f => {
        const baseScore = f.impactScore || 0.5
        const usageBoost = Math.min((f.usageCount || 0) / 20, 0.3)
        return Math.min(baseScore + usageBoost, 1.0)
      })

      expect(adjusted[0]).toBeCloseTo(0.55, 2)
      expect(adjusted[1]).toBeCloseTo(0.85, 2)
      expect(adjusted[2]).toBe(1.0)
    })

    it('should factor confidence into importance', () => {
      const facts = [
        createMockFact({ confidence: 0.5, impactScore: 0.8 }),
        createMockFact({ confidence: 0.9, impactScore: 0.8 }),
      ]

      const final = facts.map(f => (f.confidence || 1.0) * (f.impactScore || 0.5))

      expect(final[0]).toBe(0.4)
      expect(final[1]).toBeCloseTo(0.72, 2)
    })

    it('should normalize importance scores', () => {
      const facts = [
        createMockFact({ confidence: 0.8, impactScore: 0.6 }),
        createMockFact({ confidence: 0.9, impactScore: 0.8 }),
        createMockFact({ confidence: 0.7, impactScore: 0.5 }),
      ]

      const raw = facts.map(f => (f.confidence || 1) * (f.impactScore || 0.5))
      const maxScore = Math.max(...raw)
      const normalized = raw.map(s => (maxScore > 0 ? s / maxScore : 0))

      expect(normalized[0]).toBeCloseTo(0.667, 2)
      expect(normalized[2]).toBeCloseTo(0.486, 2)
    })
  })

  describe('Analytics Calculations', () => {
    it('should calculate average confidence', () => {
      const facts = [
        createMockFact({ confidence: 0.9 }),
        createMockFact({ confidence: 0.85 }),
        createMockFact({ confidence: 0.95 }),
        createMockFact({ confidence: 0.8 }),
      ]

      const avg = facts.reduce((sum, f) => sum + (f.confidence || 0), 0) / facts.length

      expect(avg).toBeCloseTo(0.9, 1)
    })

    it('should count facts by type', () => {
      const facts = [
        createMockFact({ type: 'conversation' }),
        createMockFact({ type: 'conversation' }),
        createMockFact({ type: 'user' }),
        createMockFact({ type: 'preference' }),
        createMockFact({ type: 'conversation' }),
      ]

      const typeCount = {
        conversation: facts.filter(f => f.type === 'conversation').length,
        user: facts.filter(f => f.type === 'user').length,
        preference: facts.filter(f => f.type === 'preference').length,
      }

      expect(typeCount.conversation).toBe(3)
      expect(typeCount.user).toBe(1)
      expect(typeCount.preference).toBe(1)
    })

    it('should count facts by scope', () => {
      const facts = [
        createMockFact({ scope: 'conversation' }),
        createMockFact({ scope: 'user' }),
        createMockFact({ scope: 'conversation' }),
        createMockFact({ scope: 'user' }),
        createMockFact({ scope: 'user' }),
      ]

      const scopeCount = {
        conversation: facts.filter(f => f.scope === 'conversation').length,
        user: facts.filter(f => f.scope === 'user').length,
      }

      expect(scopeCount.conversation).toBe(2)
      expect(scopeCount.user).toBe(3)
    })

    it('should identify expiring facts', () => {
      const now = Date.now()
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

      const facts = [
        createMockFact({ expiresAt: new Date(now + sevenDaysMs + 1000) }),
        createMockFact({ expiresAt: new Date(now + 3 * 24 * 60 * 60 * 1000) }),
        createMockFact({ expiresAt: new Date(now + 86400000) }),
        createMockFact({ expiresAt: new Date(now + 10 * 24 * 60 * 60 * 1000) }),
      ]

      const expiringSoon = facts.filter(f => {
        const expiresMs = f.expiresAt?.getTime() || now + 30 * 24 * 60 * 60 * 1000
        return expiresMs <= now + sevenDaysMs && expiresMs > now
      }).length

      expect(expiringSoon).toBe(2)
    })

    it('should calculate days until expiry', () => {
      const now = Date.now()
      const facts = [
        createMockFact({ expiresAt: new Date(now + 24 * 60 * 60 * 1000) }),
        createMockFact({ expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000) }),
        createMockFact({ expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000) }),
      ]

      const daysUntilExpiry = facts.map(f => {
        const expiresMs = f.expiresAt?.getTime() || now + 30 * 24 * 60 * 60 * 1000
        return Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000))
      })

      expect(daysUntilExpiry[0]).toBe(1)
      expect(daysUntilExpiry[1]).toBe(7)
      expect(daysUntilExpiry[2]).toBe(30)
    })

    it('should handle facts without expiry dates', () => {
      const facts = [
        createMockFact({ expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }),
        createMockFact({ expiresAt: undefined }),
        createMockFact({ expiresAt: undefined }),
      ]

      const expireInfo = facts.map(f => ({
        hasExpiry: !!f.expiresAt,
        daysUntilExpiry: f.expiresAt
          ? Math.ceil((f.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
          : null,
      }))

      expect(expireInfo[0].hasExpiry).toBe(true)
      expect(expireInfo[1].hasExpiry).toBe(false)
      expect(expireInfo[2].hasExpiry).toBe(false)
    })
  })

  describe('Fact Aging and Relevance', () => {
    it('should calculate fact age in days', () => {
      const now = Date.now()
      const facts = [
        createMockFact({ extractedAt: new Date(now) }),
        createMockFact({ extractedAt: new Date(now - 7 * 24 * 60 * 60 * 1000) }),
        createMockFact({ extractedAt: new Date(now - 30 * 24 * 60 * 60 * 1000) }),
      ]

      const age = facts.map(f => {
        const extractedMs = f.extractedAt?.getTime() || now
        return Math.floor((now - extractedMs) / (24 * 60 * 60 * 1000))
      })

      expect(age[0]).toBe(0)
      expect(age[1]).toBe(7)
      expect(age[2]).toBe(30)
    })

    it('should apply age decay to relevance', () => {
      const now = Date.now()
      const baseRelevance = 0.8

      const facts = [
        createMockFact({ extractedAt: new Date(now) }),
        createMockFact({ extractedAt: new Date(now - 7 * 24 * 60 * 60 * 1000) }),
        createMockFact({ extractedAt: new Date(now - 30 * 24 * 60 * 60 * 1000) }),
      ]

      const relevance = facts.map(f => {
        const ageDays = Math.floor((now - (f.extractedAt?.getTime() || now)) / (24 * 60 * 60 * 1000))
        const decayFactor = Math.exp(-ageDays / 30)
        return baseRelevance * decayFactor
      })

      expect(relevance[0]).toBeCloseTo(0.8, 1)
      expect(relevance[1]).toBeLessThan(relevance[0])
      expect(relevance[2]).toBeLessThan(relevance[1])
    })

    it('should identify recent vs old facts', () => {
      const now = Date.now()
      const recentThresholdMs = 7 * 24 * 60 * 60 * 1000

      const facts = [
        createMockFact({ extractedAt: new Date(now - 1 * 24 * 60 * 60 * 1000) }),
        createMockFact({ extractedAt: new Date(now - 14 * 24 * 60 * 60 * 1000) }),
        createMockFact({ extractedAt: new Date(now - 60 * 24 * 60 * 60 * 1000) }),
      ]

      const classification = facts.map(f => {
        const age = now - (f.extractedAt?.getTime() || now)
        return age < recentThresholdMs ? 'recent' : 'old'
      })

      expect(classification[0]).toBe('recent')
      expect(classification[1]).toBe('old')
      expect(classification[2]).toBe('old')
    })

    it('should calculate time-based importance adjustment', () => {
      const now = Date.now()
      const baseImportance = 0.7

      const facts = [
        createMockFact({ extractedAt: new Date(now), impactScore: baseImportance }),
        createMockFact({
          extractedAt: new Date(now - 14 * 24 * 60 * 60 * 1000),
          impactScore: baseImportance,
        }),
        createMockFact({
          extractedAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
          impactScore: baseImportance,
        }),
      ]

      const adjusted = facts.map(f => {
        const ageDays = Math.floor((now - (f.extractedAt?.getTime() || now)) / (24 * 60 * 60 * 1000))
        const boost = Math.max(1 - ageDays / 90, 0.5)
        return (f.impactScore || 0.5) * boost
      })

      expect(adjusted[0]).toBeCloseTo(0.7, 1)
      expect(adjusted[1]).toBeCloseTo(0.595, 2)
      expect(adjusted[2]).toBeCloseTo(0.35, 1)
    })
  })

  describe('Composite Scoring', () => {
    it('should combine sentiment, confidence, and age', () => {
      const now = Date.now()
      const fact = createMockFact({
        confidence: 0.9,
        sentiment: 0.7,
        impactScore: 0.8,
        extractedAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      })

      const score =
        (fact.confidence || 1.0) * 0.3 +
        Math.abs(fact.sentiment || 0) * 0.2 +
        (fact.impactScore || 0.5) * 0.4 +
        (1 - Math.min(7, 30) / 30) * 0.1

      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(1.0)
    })

    it('should rank facts by composite importance', () => {
      const facts = [
        createMockFact({ confidence: 0.9, sentiment: 0.5, impactScore: 0.7 }),
        createMockFact({ confidence: 0.7, sentiment: 0.8, impactScore: 0.6 }),
        createMockFact({ confidence: 0.95, sentiment: 0.3, impactScore: 0.9 }),
      ]

      const scores = facts
        .map(f => ({
          factId: f.id,
          score: (f.confidence || 1) * (f.impactScore || 0.5),
        }))
        .sort((a, b) => b.score - a.score)

      expect(scores[0].score).toBeGreaterThan(scores[1].score)
      expect(scores[1].score).toBeGreaterThan(scores[2].score)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty fact collection', () => {
    interface Fact {
        id?: string
        confidence?: number
        sentiment?: number
        impactScore?: number
        usageCount?: number
        type?: string
        scope?: string
        extractedAt?: Date
        expiresAt?: Date
        content?: string
    }

    const facts: Fact[] = []
      const avgConfidence = facts.length > 0
        ? facts.reduce((sum, f) => sum + (f.confidence || 0), 0) / facts.length
        : 0

      expect(avgConfidence).toBe(0)
    })

    it('should handle facts with missing optional fields', () => {
      const facts = [
        createMockFact({ sentiment: undefined }),
        createMockFact({ impactScore: undefined }),
        createMockFact({ usageCount: undefined }),
      ]

      const hasAllFields = facts.map(f => ({
        hasSentiment: f.sentiment !== undefined,
        hasImpactScore: f.impactScore !== undefined,
        hasUsageCount: f.usageCount !== undefined,
      }))

      expect(hasAllFields[0].hasSentiment).toBe(false)
      expect(hasAllFields[1].hasImpactScore).toBe(false)
    })

    it('should validate ranges', () => {
      const sentiments = [-1, -0.5, 0, 0.5, 1]
      const confidences = [0, 0.25, 0.5, 0.75, 1]

      const validSentiments = sentiments.every(s => s >= -1 && s <= 1)
      const validConfidences = confidences.every(c => c >= 0 && c <= 1)

      expect(validSentiments).toBe(true)
      expect(validConfidences).toBe(true)
    })

    it('should handle extreme values gracefully', () => {
      const fact1 = createMockFact({
        confidence: 1.0,
        sentiment: 1.0,
        impactScore: 1.0,
      })

      const fact2 = createMockFact({
        confidence: 0.0,
        sentiment: -1.0,
        impactScore: 0.0,
      })

      const normalized = [fact1, fact2].map(f => ({
        confidence: Math.max(0, Math.min(1, f.confidence || 0.5)),
        sentiment: Math.max(-1, Math.min(1, f.sentiment || 0)),
        impact: Math.max(0, Math.min(1, f.impactScore || 0.5)),
      }))

      normalized.forEach(n => {
        expect(n.confidence >= 0 && n.confidence <= 1).toBe(true)
        expect(n.sentiment >= -1 && n.sentiment <= 1).toBe(true)
        expect(n.impact >= 0 && n.impact <= 1).toBe(true)
      })
    })
  })

  describe('Factory Functions', () => {
    it('should generate different fact types', () => {
      const technical = factoryFacts.technical()
      const actionItem = factoryFacts.actionItem()
      const blocker = factoryFacts.blocker()

      expect(technical.sentiment).toBeGreaterThan(0)
      expect(actionItem.content).toContain('error handling')
      expect(blocker.sentiment).toBeLessThan(0)
    })

    it('should generate high and low confidence facts', () => {
      const highConf = factoryFacts.highConfidence()
      const lowConf = factoryFacts.lowConfidence()

      expect(highConf.confidence).toBeGreaterThan(0.9)
      expect(lowConf.confidence).toBeLessThan(0.5)
    })

    it('should generate recent and old facts', () => {
      const now = Date.now()
      const recent = factoryFacts.recent()
      const old = factoryFacts.old()

      const recentAge = now - (recent.extractedAt?.getTime() || now)
      const oldAge = now - (old.extractedAt?.getTime() || now)

      expect(recentAge).toBeLessThan(oldAge)
    })

    it('should generate facts with varying sentiments', () => {
      const positive = factoryFacts.technical()
      const negative = factoryFacts.blocker()

      expect(positive.sentiment).toBeGreaterThan(0)
      expect(negative.sentiment).toBeLessThan(0)
    })
  })

  describe('Edge Case Data', () => {
    it('should validate zero values', () => {
      const zeroFact = edgeCaseData.zeroValues
      expect(zeroFact.confidence).toBe(0)
      expect(zeroFact.sentiment).toBe(0)
      expect(zeroFact.usageCount).toBe(0)
    })

    it('should validate max values', () => {
      const maxFact = edgeCaseData.maxValues
      expect(maxFact.confidence).toBe(1)
      expect(maxFact.sentiment).toBe(1)
      expect(maxFact.impactScore).toBe(1)
    })

    it('should handle very long content', () => {
      const longFact = edgeCaseData.veryLongContent
      expect(longFact.content.length).toBeGreaterThan(1000)
    })

    it('should handle special characters', () => {
      const specialFact = edgeCaseData.specialCharacters
      expect(specialFact.content).toMatch(/[!@#$%^&*()_+=\[\]{}|;:,.<>?/~`]/)
    })

    it('should handle unicode characters', () => {
      const unicodeFact = edgeCaseData.unicode
      expect(unicodeFact.content).toMatch(/[éñ🚀]/)
    })
  })
})
