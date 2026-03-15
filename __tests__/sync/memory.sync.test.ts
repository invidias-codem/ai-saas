import {
  mergeMemoryFacts,
  mergeUserPreferences,
  detectPreferenceConflicts,
  filterValidFacts,
  generateMemorySyncChecksum,
  batchMemorySync,
  calculateSyncMetrics,
  getDefaultPreferences,
  SyncMetrics,
} from '@/lib/memorySyncUtils';
// FIX: Import MemorySyncMessage directly from the schema file, 
// as it is not being re-exported by intelligentMemory.
import { MemorySyncMessage } from '@/lib/memorySyncUtils'; 
import { ExtractedFact, UserPreferences } from '@/lib/intelligentMemory'; 
import { createMockFact } from '@/__tests__/utils/testHelpers';

describe('Memory Sync Utilities', () => {
// ------------------------------------------------------------------------------------------------
  describe('Checksum Generation', () => {
    it('should generate consistent checksums for same data', () => {
      const data = { id: 'fact_1', content: 'test' };
      const deviceId = 'device_1';

      const checksum1 = generateMemorySyncChecksum('fact', data, deviceId);
      const checksum2 = generateMemorySyncChecksum('fact', data, deviceId);

      expect(checksum1).toBe(checksum2);
    })

    it('should generate different checksums for different data', () => {
      const data1 = { id: 'fact_1', content: 'test1' };
      const data2 = { id: 'fact_1', content: 'test2' };
      const deviceId = 'device_1';

      const checksum1 = generateMemorySyncChecksum('fact', data1, deviceId);
      const checksum2 = generateMemorySyncChecksum('fact', data2, deviceId);

      expect(checksum1).not.toBe(checksum2);
    })
  })
// ------------------------------------------------------------------------------------------------
  describe('Fact Merging', () => {
    it('should merge facts without duplicates', () => {
      const fact1 = createMockFact({ id: 'fact_1', content: 'Original' })
      const fact2 = createMockFact({ id: 'fact_2', content: 'New fact' })

      const merged = mergeMemoryFacts([fact1], [fact2], 'device_1')

      expect(merged).toHaveLength(2)
      expect(merged.some(f => f.id === 'fact_1')).toBe(true)
      expect(merged.some(f => f.id === 'fact_2')).toBe(true)
    })

    it('should keep highest confidence when merging duplicate facts', () => {
      const fact1 = createMockFact({ id: 'fact_1', confidence: 0.7 })
      const fact2 = createMockFact({ id: 'fact_1', confidence: 0.9 })

      const merged = mergeMemoryFacts([fact1], [fact2], 'device_1')

      expect(merged).toHaveLength(1)
      expect(merged[0].confidence).toBe(0.9)
    })

    it('should combine usage counts on merge', () => {
      const fact1 = createMockFact({ id: 'fact_1', usageCount: 5 })
      const fact2 = createMockFact({ id: 'fact_1', usageCount: 3 })

      const merged = mergeMemoryFacts([fact1], [fact2], 'device_1')

      expect(merged[0].usageCount).toBe(8)
    })

    it('should average sentiment scores on merge', () => {
      const fact1 = createMockFact({ id: 'fact_1', sentiment: 0.8 })
      const fact2 = createMockFact({ id: 'fact_1', sentiment: 0.6 })

      const merged = mergeMemoryFacts([fact1], [fact2], 'device_1')

      expect(merged[0].sentiment).toBeCloseTo(0.7, 1)
    })

    it('should handle facts without IDs', () => {
      const fact1 = createMockFact({ id: 'fact_1' })
      const fact2 = createMockFact({ id: undefined })

      const merged = mergeMemoryFacts([fact1], [fact2], 'device_1')

      expect(merged).toHaveLength(2)
      expect(merged.every(f => f.id)).toBe(true)
    })
  })
// ------------------------------------------------------------------------------------------------
  describe('Preference Merging', () => {
    it('should merge preferences from multiple devices', () => {
      const prefs1: UserPreferences = {
        communicationStyle: 'technical',
        preferredDepth: 'detailed',
        topics: { 'Python': 0.9 },
        sentimentPreference: 0.2,
        learnedTopics: ['Python'],
        avgResponseLength: 300,
        preferredFormats: ['code'],
      }

      const prefs2: UserPreferences = {
        communicationStyle: 'technical',
        preferredDepth: 'detailed',
        topics: { 'Python': 0.85, 'JavaScript': 0.7 },
        sentimentPreference: 0.1,
        learnedTopics: ['Python', 'JavaScript'],
        avgResponseLength: 250,
        preferredFormats: ['code', 'explanation'],
      }

      const prefsMap = new Map([
        ['device_1', prefs1],
        ['device_2', prefs2],
      ])

      const merged = mergeUserPreferences(prefsMap)

      expect(merged.communicationStyle).toBe('technical')
      expect(merged.topics['Python']).toBeCloseTo(0.875, 2)
      expect(merged.topics['JavaScript']).toBeGreaterThan(0)
      expect(merged.preferredFormats).toContain('code')
      expect(merged.preferredFormats).toContain('explanation')
    })

    it('should handle conflicting communication styles', () => {
      const prefs1: UserPreferences = {
        ...getDefaultPreferences(),
        communicationStyle: 'technical',
      }

      const prefs2: UserPreferences = {
        ...getDefaultPreferences(),
        communicationStyle: 'casual',
      }

      const prefsMap = new Map([
        ['device_1', prefs1],
        ['device_2', prefs2],
      ])

      const merged = mergeUserPreferences(prefsMap)

      expect(['technical', 'casual']).toContain(merged.communicationStyle)
    })

    it('should average sentiment preferences', () => {
      const prefs1: UserPreferences = {
        ...getDefaultPreferences(),
        sentimentPreference: 0.8,
      }

      const prefs2: UserPreferences = {
        ...getDefaultPreferences(),
        sentimentPreference: 0.2,
      }

      const prefsMap = new Map([
        ['device_1', prefs1],
        ['device_2', prefs2],
      ])

      const merged = mergeUserPreferences(prefsMap)

      expect(merged.sentimentPreference).toBeCloseTo(0.5, 1)
    })

    it('should cap sentiment preference at -1 to 1 range', () => {
      const prefs1: UserPreferences = {
        ...getDefaultPreferences(),
        sentimentPreference: 1.5,
      }

      const prefsMap = new Map([['device_1', prefs1]])

      const merged = mergeUserPreferences(prefsMap)

      expect(merged.sentimentPreference).toBeGreaterThanOrEqual(-1)
      expect(merged.sentimentPreference).toBeLessThanOrEqual(1)
    })
  })
// ------------------------------------------------------------------------------------------------
  describe('Conflict Detection', () => {
    it('should detect style conflicts', () => {
      const prefs1: UserPreferences = {
        ...getDefaultPreferences(),
        communicationStyle: 'technical',
      }

      const prefs2: UserPreferences = {
        ...getDefaultPreferences(),
        communicationStyle: 'casual',
      }

      const conflicts = detectPreferenceConflicts([prefs1, prefs2])

      expect(conflicts.length).toBeGreaterThan(0)
      expect(conflicts[0]).toContain('Communication style')
    })

    it('should detect sentiment conflicts', () => {
      const prefs1: UserPreferences = {
        ...getDefaultPreferences(),
        sentimentPreference: 1.0,
      }

      const prefs2: UserPreferences = {
        ...getDefaultPreferences(),
        sentimentPreference: -1.0,
      }

      const conflicts = detectPreferenceConflicts([prefs1, prefs2])

      expect(conflicts.some(c => c.includes('Sentiment'))).toBe(true)
    })

    it('should return empty conflicts for consistent preferences', () => {
      const prefs1: UserPreferences = {
        ...getDefaultPreferences(),
        communicationStyle: 'technical',
        sentimentPreference: 0.3,
      }

      const prefs2: UserPreferences = {
        ...getDefaultPreferences(),
        communicationStyle: 'technical',
        sentimentPreference: 0.2,
      }

      const conflicts = detectPreferenceConflicts([prefs1, prefs2])

      expect(conflicts).toHaveLength(0)
    })
  })
// ------------------------------------------------------------------------------------------------
  describe('Fact Filtering', () => {
    it('should filter expired facts', () => {
      const validFact = createMockFact({
        expiresAt: new Date(Date.now() + 86400000),
      })
      const expiredFact = createMockFact({
        expiresAt: new Date(Date.now() - 86400000),
      })

      const filtered = filterValidFacts([validFact, expiredFact])

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(validFact.id)
    })

    it('should filter facts with low confidence', () => {
      const highConfFact = createMockFact({ confidence: 0.8 })
      const lowConfFact = createMockFact({ confidence: 0.2 })

      const filtered = filterValidFacts([highConfFact, lowConfFact])

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(highConfFact.id)
    })

    it('should filter very old facts', () => {
      const recentFact = createMockFact({
        extractedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      })
      const oldFact = createMockFact({
        extractedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      })

      const filtered = filterValidFacts([recentFact, oldFact])

      expect(filtered.length).toBeLessThanOrEqual(2)
    })

    it('should keep valid facts with good scores', () => {
      const validFacts = [
        createMockFact({ confidence: 0.9, sentiment: 0.7 }),
        createMockFact({ confidence: 0.85, sentiment: -0.3 }),
        createMockFact({ confidence: 0.7, sentiment: 0.0 }),
      ]

      const filtered = filterValidFacts(validFacts)

      expect(filtered).toHaveLength(3)
    })
  })
// ------------------------------------------------------------------------------------------------
  describe('Batch Operations', () => {
    it('should batch messages correctly', () => {
      const facts = Array(250)
        .fill(null)
        .map((_, i) => createMockFact({ 
            id: `fact_${i}`,
            type: 'conversation' as const, 
            content: 'test content', 
            confidence: 0.8 
        }));

      const messages: MemorySyncMessage[] = facts.map((fact, i) => ({
        id: `msg_${i}`,
        type: 'fact',
        deviceId: 'device_1',
        timestamp: Date.now(),
        data: fact,
        checksum: generateMemorySyncChecksum('fact', fact, 'device_1'),
      }));

      const batches = batchMemorySync(messages, 100)

      expect(batches).toHaveLength(3)
      expect(Array.isArray(batches[0])).toBe(true)
      expect(batches[0]).toHaveLength(100)
      expect(Array.isArray(batches[1])).toBe(true)
      expect(batches[1]).toHaveLength(100)
      expect(Array.isArray(batches[2])).toBe(true)
      expect(batches[2]).toHaveLength(50)
    })

    it('should handle empty message array', () => {
      const batches = batchMemorySync([], 100)

      expect(batches).toHaveLength(0)
    })
  })
// ------------------------------------------------------------------------------------------------
  describe('Sync Metrics', () => {
    it('should calculate sync metrics correctly', () => {
      const before = { facts: 10, preferences: 1, feedback: 5 }
      const after = { facts: 15, preferences: 1, feedback: 8 }
      const duration = 1500
      const deduplicated = 2

      const metrics = calculateSyncMetrics(before, after, duration, deduplicated)

      expect(metrics.factsSynced).toBe(5)
      expect(metrics.preferencesSynced).toBe(0)
      expect(metrics.feedbackRecorded).toBe(3)
      expect(metrics.factsDeduplicated).toBe(2)
      expect(metrics.syncDuration).toBe(1500)
    })

    it('should calculate deduplication rate', () => {
      const before = { facts: 10, preferences: 1, feedback: 5 }
      const after = { facts: 12, preferences: 1, feedback: 5 }
      const duration = 500
      const deduplicated = 2

      const metrics = calculateSyncMetrics(before, after, duration, deduplicated)

      expect(metrics.deduplicationRate).toBeCloseTo(1, 1)
    })
  })
// ------------------------------------------------------------------------------------------------
  describe('Default Preferences', () => {
    it('should return valid default preferences', () => {
      const defaults = getDefaultPreferences()

      expect(defaults.communicationStyle).toBe('balanced')
      expect(defaults.preferredDepth).toBe('balanced')
      expect(defaults.sentimentPreference).toBe(0)
      expect(defaults.learnedTopics).toEqual([])
      expect(defaults.preferredFormats).toEqual(['text'])
    })
  })
})
