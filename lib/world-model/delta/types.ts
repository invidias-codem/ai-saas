/**
 * Delta Engine — Type Definitions
 * Phase 3 of World Model
 */

import { ClaimVerdict } from '../types'

export type { ClaimVerdict }

export type ClaimDomain = 'code' | 'current_events' | 'product' | 'personal' | 'general'

export interface ExtractedClaim {
  id: string
  text: string
  embedding?: number[]
  subject: string
  predicate: string
  object: string
  domain: ClaimDomain
  confidence: number
}

export interface ClaimAuditResult {
  claim: ExtractedClaim
  verdict: ClaimVerdict
  deltaScore: number // 0=perfect, 1=fabrication
  graphEdgeId?: string
  contradictsNodeId?: string
  explanation: string
  model: string
  sessionId: string
  timestamp: Date
}

export interface DeltaEngineConfig {
  enabledDomains: ClaimDomain[]
  minConfidenceThreshold: number
  similarityThresholds: {
    confirmed: number
    supported: number
    unverified: number
  }
}

export interface AuditSummary {
  sessionId: string
  totalClaims: number
  verdictCounts: Record<ClaimVerdict, number>
  averageDeltaScore: number
  hallucinationRate: number
}

export interface ModelTruthScore {
  model: string
  domain: string
  totalClaims: number
  confirmedRate: number
  hallucinationRate: number
  avgDelta: number
}
