/**
 * Distribution Shift Detector — Type Definitions
 * Tech Genie / World Model Layer
 *
 * Types for tracking query distribution drift across domains,
 * measuring Jensen-Shannon divergence, and triggering knowledge
 * staleness alerts when the world graph lags behind query patterns.
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */

// ─────────────────────────────────────────────
// Domain Types
// ─────────────────────────────────────────────

/**
 * Query domain classification — mirrors RoutingModel domain taxonomy.
 * Determines which partition of the world graph is relevant.
 */
export type QueryDomain =
  | 'code'
  | 'reasoning'
  | 'research'
  | 'current_events'
  | 'strategy'
  | 'orchestration'
  | 'general'

// ─────────────────────────────────────────────
// Query Fingerprint
// ─────────────────────────────────────────────

/**
 * A single query fingerprint logged for distribution tracking.
 * Written to `wm_query_fingerprints` on every incoming query.
 */
export interface QueryFingerprint {
  /** UUID primary key */
  id: string
  /** Session identifier linking fingerprint to a conversation */
  session_id: string
  /** Classified domain for this query */
  domain: QueryDomain
  /** Optional subdomain path, e.g. 'lib/world-model', 'auth', 'payments' */
  subdomain?: string
  /** Top 10 TF-IDF terms extracted from the query */
  keywords: string[]
  /** Timestamp of the query */
  timestamp: Date
  /** Model that handled this query */
  model_used: string
}

// ─────────────────────────────────────────────
// Distribution Windows
// ─────────────────────────────────────────────

/**
 * Rolling distribution window summarising query volume and keywords
 * for a single domain over a fixed time range.
 */
export interface DomainDistributionWindow {
  /** Domain this window describes */
  domain: QueryDomain
  /** Inclusive start of the window */
  window_start: Date
  /** Inclusive end of the window */
  window_end: Date
  /** Raw query count in this window */
  total_queries: number
  /** Fraction of total cross-domain traffic (0.0–1.0) */
  query_proportion: number
  /** Most frequent terms in this window, sorted by frequency descending */
  top_keywords: Array<{ term: string; frequency: number }>
  /** Average hallucination delta score for this domain in the window */
  avg_delta_score: number
  /** When world graph nodes for this domain were last refreshed */
  last_graph_update: Date
}

// ─────────────────────────────────────────────
// Drift Measurement
// ─────────────────────────────────────────────

/**
 * Result of a Jensen-Shannon divergence comparison between the
 * rolling 7-day window and the 30-day baseline for one domain.
 */
export interface DriftMeasurement {
  /** Domain being measured */
  domain: QueryDomain
  /**
   * Jensen-Shannon divergence score.
   * 0.0 = identical distributions, 1.0 = maximum drift.
   */
  js_divergence: number
  /** Domain proportion in the 30-day baseline period */
  baseline_proportion: number
  /** Domain proportion in the rolling 7-day window */
  current_proportion: number
  /**
   * Traffic trend relative to baseline.
   * surging = current > baseline × 1.3
   * declining = current < baseline × 0.7
   */
  trend: 'surging' | 'stable' | 'declining'
  /** Hours since the last world graph update for this domain */
  graph_staleness_hours: number
  /** True when drift and staleness thresholds are both exceeded */
  alert_triggered: boolean
}

// ─────────────────────────────────────────────
// Staleness Events
// ─────────────────────────────────────────────

/**
 * Staleness event written to `wm_staleness_events` when drift
 * and staleness together exceed configured thresholds.
 * Persisted until manually resolved.
 */
export interface KnowledgeStalenessEvent {
  /** UUID primary key */
  id: string
  /** When this event was detected */
  created_at: Date
  /** Domain that triggered the event */
  domain: QueryDomain
  /** JS divergence score at time of detection */
  js_divergence: number
  /** Graph staleness in hours at time of detection */
  graph_staleness_hours: number
  /**
   * Severity classification based on divergence and staleness magnitude.
   * critical > high > medium > low
   */
  severity: 'low' | 'medium' | 'high' | 'critical'
  /**
   * Recommended remediation action.
   * emergency_update > refresh_graph > add_grounding_feed > manual_review
   */
  recommended_action:
    | 'refresh_graph'
    | 'add_grounding_feed'
    | 'manual_review'
    | 'emergency_update'
  /** Set when the event has been addressed */
  resolved_at?: Date
  /** Who resolved the event (user ID or system identifier) */
  resolved_by?: string
}

// ─────────────────────────────────────────────
// Full Distribution Report
// ─────────────────────────────────────────────

/**
 * Complete distribution report across all domains,
 * combining windows, drift measurements, and active staleness events.
 */
export interface DistributionReport {
  /** Timestamp when this report was generated */
  generated_at: Date
  /** Rolling window size in days used for current measurements */
  window_days: number
  /** Total fingerprints analysed in this report */
  total_queries_analyzed: number
  /** Per-domain window summaries */
  domain_windows: DomainDistributionWindow[]
  /** Drift measurements relative to baseline */
  drift_measurements: DriftMeasurement[]
  /** Active (unresolved) staleness events */
  staleness_events: KnowledgeStalenessEvent[]
  /**
   * Aggregate health signal for the world graph.
   * healthy = no active alerts
   * degrading = medium or high severity alerts present
   * critical = any critical severity alert present
   */
  overall_health: 'healthy' | 'degrading' | 'critical'
}
