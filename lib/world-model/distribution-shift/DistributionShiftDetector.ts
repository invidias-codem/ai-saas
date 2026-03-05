/**
 * DistributionShiftDetector — Query Distribution Drift Monitor
 * Tech Genie / World Model Layer
 *
 * Detects when the distribution of incoming queries has drifted away from
 * the baseline that the world graph was built on. When a domain surges and
 * its knowledge graph is stale, a KnowledgeStalenessEvent is written to
 * Supabase so that operators can refresh or supplement the graph.
 *
 * Algorithm:
 *   1. Log every query as a QueryFingerprint in `wm_query_fingerprints`
 *   2. Compute per-domain proportions over a 7-day rolling window
 *   3. Compare to 30-day baseline using Jensen-Shannon divergence
 *   4. Fire staleness alerts when JS divergence exceeds threshold
 *      AND the domain graph is older than STALENESS_THRESHOLD_HOURS
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  QueryDomain,
  QueryFingerprint,
  DomainDistributionWindow,
  DriftMeasurement,
  KnowledgeStalenessEvent,
  DistributionReport,
} from './types'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** Number of days in the rolling current window */
const ROLLING_WINDOW_DAYS = 7

/** Number of days in the baseline comparison window */
const BASELINE_WINDOW_DAYS = 30

/**
 * JS divergence threshold above which an alert is eligible.
 * 0.15 ≈ a meaningful but not catastrophic distribution shift.
 */
const JS_DIVERGENCE_THRESHOLD = 0.15

/**
 * Hours since last graph update above which staleness is actionable.
 * Only combined with a surging trend does this trigger an alert.
 */
const STALENESS_THRESHOLD_HOURS = 72

/**
 * Minimum number of queries in the current window for a domain before
 * alerts are fired — avoids false positives on sparse traffic.
 */
const MIN_QUERIES_FOR_DETECTION = 20

/** Small epsilon added to probabilities to avoid log(0) in KL divergence */
const EPSILON = 1e-10

/** All known query domains in a canonical order */
const ALL_DOMAINS: QueryDomain[] = [
  'code',
  'reasoning',
  'research',
  'current_events',
  'strategy',
  'orchestration',
  'general',
]

// ─────────────────────────────────────────────
// Domain Classification Patterns
// ─────────────────────────────────────────────

/**
 * Local domain classification patterns.
 * Re-implemented here to avoid circular dependency with RoutingModel.
 * Keep in sync with DOMAIN_PATTERNS in lib/world-model/ml/RoutingModel.ts.
 */
const LOCAL_DOMAIN_PATTERNS: Array<{ domain: QueryDomain; pattern: RegExp }> = [
  {
    domain: 'code',
    pattern: /\b(code|function|bug|debug|typescript|python|javascript|algorithm|class|api|refactor|implement|error|compile)\b/i,
  },
  {
    domain: 'reasoning',
    pattern: /\b(why|because|therefore|logic|prove|deduce|infer|conclude|reasoning|analysis|compare|evaluate)\b/i,
  },
  {
    domain: 'research',
    pattern: /\b(study|research|paper|evidence|data|statistic|survey|experiment|finding|published)\b/i,
  },
  {
    domain: 'current_events',
    pattern: /\b(today|yesterday|this week|this year|recently|latest|breaking|news|2024|2025|2026)\b/i,
  },
  {
    domain: 'strategy',
    pattern: /\b(strategy|plan|roadmap|goal|objective|priority|initiative|kpi|okr|vision|mission)\b/i,
  },
  {
    domain: 'orchestration',
    pattern: /\b(orchestrat|workflow|pipeline|agent|task|automat|coordinate|schedule|dispatch|trigger)\b/i,
  },
]

/** Common English stopwords removed before TF-IDF keyword extraction */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'this', 'that', 'it', 'its',
  'not', 'as', 'if', 'so', 'what', 'how', 'when', 'where', 'which', 'who',
])

// ─────────────────────────────────────────────
// Internal DB row shapes
// ─────────────────────────────────────────────

/** Shape of a row returned from wm_query_fingerprints */
interface FingerprintRow {
  id: string
  session_id: string
  domain: string
  subdomain: string | null
  keywords: string[]
  timestamp: string
  model_used: string
}

/** Shape of a row returned from wm_staleness_events */
interface StalenessEventRow {
  id: string
  created_at: string
  domain: string
  js_divergence: number
  graph_staleness_hours: number
  severity: string
  recommended_action: string
  resolved_at: string | null
  resolved_by: string | null
}

/** Shape of the updated_at field from wm_knowledge_nodes */
interface KnowledgeNodeRow {
  updated_at: string
}

// ─────────────────────────────────────────────
// Pure Math Helpers
// ─────────────────────────────────────────────

/**
 * Kullback-Leibler divergence: KL(P || Q) = Σ p_i × log(p_i / q_i).
 * Epsilon is added to both p and q to avoid log(0).
 *
 * @param p - Probability vector P (must sum to 1)
 * @param q - Probability vector Q (must sum to 1, same length as p)
 * @returns Non-negative divergence value
 */
function klDivergence(p: number[], q: number[]): number {
  let sum = 0
  for (let i = 0; i < p.length; i++) {
    const pi = p[i] + EPSILON
    const qi = q[i] + EPSILON
    sum += pi * Math.log(pi / qi)
  }
  return sum
}

/**
 * Jensen-Shannon divergence: JS(P || Q) = 0.5 × KL(P || M) + 0.5 × KL(Q || M)
 * where M = (P + Q) / 2.
 * Result is bounded in [0, 1] (using natural log; divide by log(2) for bits).
 *
 * @param p - Probability vector P
 * @param q - Probability vector Q
 * @returns JS divergence in [0, 1]
 */
function jsDivergence(p: number[], q: number[]): number {
  const m = p.map((pi, i) => (pi + q[i]) / 2)
  const js = 0.5 * klDivergence(p, m) + 0.5 * klDivergence(q, m)
  // Normalise to [0, 1] by dividing by ln(2)
  return Math.min(1, Math.max(0, js / Math.LN2))
}

/**
 * Aggregate raw fingerprint rows into per-domain query counts.
 *
 * @param rows - Raw DB rows from wm_query_fingerprints
 * @returns Map from domain to count
 */
function countsByDomain(rows: FingerprintRow[]): Map<QueryDomain, number> {
  const counts = new Map<QueryDomain, number>()
  for (const domain of ALL_DOMAINS) counts.set(domain, 0)

  for (const row of rows) {
    const domain = row.domain as QueryDomain
    if (ALL_DOMAINS.includes(domain)) {
      counts.set(domain, (counts.get(domain) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Convert a domain→count map to a proportions vector aligned with ALL_DOMAINS.
 *
 * @param counts - Per-domain query counts
 * @param total  - Total queries across all domains
 * @returns Proportion for each domain in ALL_DOMAINS order
 */
function toDomainProportionVector(counts: Map<QueryDomain, number>, total: number): number[] {
  return ALL_DOMAINS.map(domain => (total > 0 ? (counts.get(domain) ?? 0) / total : 0))
}

// ─────────────────────────────────────────────
// DistributionShiftDetector
// ─────────────────────────────────────────────

/**
 * Detects distribution shift in query patterns and fires staleness alerts
 * when the world knowledge graph lags behind actual query traffic.
 *
 * Reads from and writes to Supabase. All public methods are safe to call
 * concurrently; Supabase errors are caught and logged rather than thrown.
 */
export class DistributionShiftDetector {
  private readonly supabase: SupabaseClient

  /**
   * Construct a new DistributionShiftDetector.
   *
   * @param supabase - Authenticated Supabase client with access to wm_* tables
   */
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  // ─────────────────────────────────────────────
  // Public Methods
  // ─────────────────────────────────────────────

  /**
   * Log a query fingerprint to the `wm_query_fingerprints` table.
   * Call this once per incoming query, after domain classification and
   * keyword extraction have been applied.
   *
   * @param fingerprint - All QueryFingerprint fields except `id` (generated server-side)
   */
  async logQuery(fingerprint: Omit<QueryFingerprint, 'id'>): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('wm_query_fingerprints')
        .insert({
          session_id: fingerprint.session_id,
          domain:     fingerprint.domain,
          subdomain:  fingerprint.subdomain ?? null,
          keywords:   fingerprint.keywords,
          timestamp:  fingerprint.timestamp.toISOString(),
          model_used: fingerprint.model_used,
        })

      if (error) {
        console.error('[DistributionShiftDetector] logQuery insert error:', error.message)
      }
    } catch (err) {
      console.error('[DistributionShiftDetector] logQuery unexpected error:', err)
    }
  }

  /**
   * Measure Jensen-Shannon divergence for each domain by comparing the
   * rolling 7-day window to the 30-day baseline.
   *
   * Also fetches graph staleness from `wm_knowledge_nodes` and sets
   * `alert_triggered` on domains exceeding all three thresholds.
   *
   * @returns Array of DriftMeasurement — one per QueryDomain
   */
  async measureDrift(): Promise<DriftMeasurement[]> {
    try {
      const now = new Date()
      const rollingStart = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000)
      const baselineStart = new Date(now.getTime() - BASELINE_WINDOW_DAYS * 86_400_000)

      // ── Fetch rolling window fingerprints ──
      const { data: rollingRows, error: rollingErr } = await this.supabase
        .from('wm_query_fingerprints')
        .select('id, session_id, domain, subdomain, keywords, timestamp, model_used')
        .gte('timestamp', rollingStart.toISOString())
        .lte('timestamp', now.toISOString())

      if (rollingErr) {
        console.error('[DistributionShiftDetector] measureDrift rolling fetch error:', rollingErr.message)
        return []
      }

      // ── Fetch baseline window fingerprints ──
      const { data: baselineRows, error: baselineErr } = await this.supabase
        .from('wm_query_fingerprints')
        .select('id, session_id, domain, subdomain, keywords, timestamp, model_used')
        .gte('timestamp', baselineStart.toISOString())
        .lte('timestamp', now.toISOString())

      if (baselineErr) {
        console.error('[DistributionShiftDetector] measureDrift baseline fetch error:', baselineErr.message)
        return []
      }

      const rolling  = (rollingRows  ?? []) as FingerprintRow[]
      const baseline = (baselineRows ?? []) as FingerprintRow[]

      const rollingTotal  = rolling.length
      const baselineTotal = baseline.length

      const rollingCounts  = countsByDomain(rolling)
      const baselineCounts = countsByDomain(baseline)

      const rollingVec  = toDomainProportionVector(rollingCounts,  rollingTotal)
      const baselineVec = toDomainProportionVector(baselineCounts, baselineTotal)

      // ── Compute per-domain JS divergence ──
      const measurements: DriftMeasurement[] = []

      for (let i = 0; i < ALL_DOMAINS.length; i++) {
        const domain = ALL_DOMAINS[i]
        const currentProp  = rollingVec[i]
        const baselineProp = baselineVec[i]

        // Binary distribution: [this domain, all other domains]
        const P: [number, number] = [currentProp,  1 - currentProp]
        const Q: [number, number] = [baselineProp, 1 - baselineProp]
        const jsd = jsDivergence(P, Q)

        // Trend determination
        let trend: DriftMeasurement['trend'] = 'stable'
        if (baselineProp > 0) {
          const ratio = currentProp / baselineProp
          if (ratio > 1.3)  trend = 'surging'
          if (ratio < 0.7)  trend = 'declining'
        } else if (currentProp > 0) {
          trend = 'surging' // domain appeared from nothing
        }

        // Graph staleness
        const stalenessHours = await this.getGraphStalenessHours(domain)

        // Alert conditions
        const currentQueryCount = rollingTotal * currentProp
        const alertTriggered =
          jsd > JS_DIVERGENCE_THRESHOLD &&
          stalenessHours > STALENESS_THRESHOLD_HOURS &&
          currentQueryCount > MIN_QUERIES_FOR_DETECTION

        measurements.push({
          domain,
          js_divergence:        jsd,
          baseline_proportion:  baselineProp,
          current_proportion:   currentProp,
          trend,
          graph_staleness_hours: stalenessHours,
          alert_triggered:       alertTriggered,
        })
      }

      return measurements
    } catch (err) {
      console.error('[DistributionShiftDetector] measureDrift unexpected error:', err)
      return []
    }
  }

  /**
   * Check for knowledge staleness by evaluating all domains with active drift.
   * Creates and persists a `KnowledgeStalenessEvent` for each newly detected
   * alert, then returns only events that are not already resolved in the DB.
   *
   * @returns Array of new (unresolved) KnowledgeStalenessEvent records
   */
  async checkStaleness(): Promise<KnowledgeStalenessEvent[]> {
    try {
      const driftMeasurements = await this.measureDrift()
      const alertedDomains = driftMeasurements.filter(m => m.alert_triggered)

      if (alertedDomains.length === 0) return []

      // ── Fetch existing unresolved events so we don't duplicate ──
      const { data: existingRows, error: existingErr } = await this.supabase
        .from('wm_staleness_events')
        .select('id, created_at, domain, js_divergence, graph_staleness_hours, severity, recommended_action, resolved_at, resolved_by')
        .is('resolved_at', null)

      if (existingErr) {
        console.error('[DistributionShiftDetector] checkStaleness existing events fetch error:', existingErr.message)
        return []
      }

      const existing = (existingRows ?? []) as StalenessEventRow[]
      const existingDomains = new Set(existing.map(r => r.domain))

      // ── Create new events for domains not already alerted ──
      const newEvents: KnowledgeStalenessEvent[] = []

      for (const measurement of alertedDomains) {
        if (existingDomains.has(measurement.domain)) continue

        const severity   = this.classifySeverity(measurement)
        const action     = this.recommendAction(severity, measurement)

        const { data: inserted, error: insertErr } = await this.supabase
          .from('wm_staleness_events')
          .insert({
            domain:               measurement.domain,
            js_divergence:        measurement.js_divergence,
            graph_staleness_hours: measurement.graph_staleness_hours,
            severity,
            recommended_action:   action,
          })
          .select('id, created_at, domain, js_divergence, graph_staleness_hours, severity, recommended_action, resolved_at, resolved_by')
          .single()

        if (insertErr || !inserted) {
          console.error('[DistributionShiftDetector] checkStaleness insert error:', insertErr?.message)
          continue
        }

        const row = inserted as StalenessEventRow
        newEvents.push(this.rowToStalenessEvent(row))
      }

      return newEvents
    } catch (err) {
      console.error('[DistributionShiftDetector] checkStaleness unexpected error:', err)
      return []
    }
  }

  /**
   * Generate a full DistributionReport covering all domains.
   *
   * Fetches rolling-window summaries (including top keywords per domain),
   * calls measureDrift() and checkStaleness(), then aggregates everything
   * into a single report with an overall health signal.
   *
   * @returns Complete DistributionReport across all domains
   */
  async generateReport(): Promise<DistributionReport> {
    const now       = new Date()
    const windowStart = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000)

    try {
      // ── Fetch all rolling-window fingerprints ──
      const { data: fingerprintRows, error: fpErr } = await this.supabase
        .from('wm_query_fingerprints')
        .select('id, session_id, domain, subdomain, keywords, timestamp, model_used')
        .gte('timestamp', windowStart.toISOString())
        .lte('timestamp', now.toISOString())

      if (fpErr) {
        console.error('[DistributionShiftDetector] generateReport fingerprint fetch error:', fpErr.message)
      }

      const fingerprints = (fingerprintRows ?? []) as FingerprintRow[]
      const totalQueries = fingerprints.length

      // ── Compute domain windows ──
      const domainWindows: DomainDistributionWindow[] = await Promise.all(
        ALL_DOMAINS.map(domain => this.buildDomainWindow(domain, fingerprints, totalQueries, windowStart, now))
      )

      // ── Drift measurements and staleness events ──
      const driftMeasurements  = await this.measureDrift()
      const stalenessEvents    = await this.checkStaleness()

      // ── Determine overall health ──
      let overallHealth: DistributionReport['overall_health'] = 'healthy'
      for (const event of stalenessEvents) {
        if (event.severity === 'critical') {
          overallHealth = 'critical'
          break
        }
        if (event.severity === 'high' || event.severity === 'medium') {
          overallHealth = 'degrading'
        }
      }

      return {
        generated_at:           now,
        window_days:            ROLLING_WINDOW_DAYS,
        total_queries_analyzed: totalQueries,
        domain_windows:         domainWindows,
        drift_measurements:     driftMeasurements,
        staleness_events:       stalenessEvents,
        overall_health:         overallHealth,
      }
    } catch (err) {
      console.error('[DistributionShiftDetector] generateReport unexpected error:', err)

      // Return a minimal safe report rather than crashing
      return {
        generated_at:           now,
        window_days:            ROLLING_WINDOW_DAYS,
        total_queries_analyzed: 0,
        domain_windows:         [],
        drift_measurements:     [],
        staleness_events:       [],
        overall_health:         'healthy',
      }
    }
  }

  // ─────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────

  /**
   * Extract the top 10 most frequent non-stopword terms from a query string.
   * Uses simple term-frequency weighting (no corpus IDF — query-level only).
   *
   * @param query - Raw query text
   * @returns Up to 10 lowercase keyword tokens sorted by frequency descending
   */
  public extractKeywords(query: string): string[] {
    const tokens = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t))

    const freq = new Map<string, number>()
    for (const token of tokens) {
      freq.set(token, (freq.get(token) ?? 0) + 1)
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term]) => term)
  }

  /**
   * Classify a query string into one of the known QueryDomains.
   * Matches against LOCAL_DOMAIN_PATTERNS in order; returns 'general' on no match.
   *
   * @param query - Raw query text
   * @returns Best-matching QueryDomain
   */
  public classifyDomain(query: string): QueryDomain {
    for (const { domain, pattern } of LOCAL_DOMAIN_PATTERNS) {
      if (pattern.test(query)) return domain
    }
    return 'general'
  }

  /**
   * Determine severity of a drift alert based on JS divergence and staleness.
   *
   * @param m - DriftMeasurement for the alerted domain
   * @returns Severity level string
   */
  private classifySeverity(m: DriftMeasurement): KnowledgeStalenessEvent['severity'] {
    if (m.js_divergence > 0.4 && m.graph_staleness_hours > 168) return 'critical'
    if (m.js_divergence > 0.25 || m.graph_staleness_hours > 120)  return 'high'
    if (m.js_divergence > 0.15 || m.graph_staleness_hours > 72)   return 'medium'
    return 'low'
  }

  /**
   * Recommend the best remediation action given severity and trend.
   *
   * @param severity - Computed severity for this event
   * @param m        - Full drift measurement
   * @returns Recommended action string
   */
  private recommendAction(
    severity: KnowledgeStalenessEvent['severity'],
    m: DriftMeasurement
  ): KnowledgeStalenessEvent['recommended_action'] {
    if (severity === 'critical') return 'emergency_update'
    if (severity === 'high')     return 'refresh_graph'
    if (severity === 'medium' && m.trend === 'surging') return 'add_grounding_feed'
    return 'manual_review'
  }

  /**
   * Fetch the number of hours since the domain's world graph was last updated.
   * Queries `wm_knowledge_nodes` for the most recently updated node
   * whose metadata contains the domain tag.
   *
   * Returns Infinity if no nodes found (graph never updated for this domain).
   *
   * @param domain - QueryDomain to check
   * @returns Staleness in hours
   */
  private async getGraphStalenessHours(domain: QueryDomain): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('wm_knowledge_nodes')
        .select('updated_at')
        .eq('metadata->>domain', domain)
        .order('updated_at', { ascending: false })
        .limit(1)

      if (error) {
        console.error(`[DistributionShiftDetector] getGraphStalenessHours error for domain=${domain}:`, error.message)
        return Infinity
      }

      const rows = (data ?? []) as KnowledgeNodeRow[]
      if (rows.length === 0) return Infinity

      const lastUpdate = new Date(rows[0].updated_at)
      const nowMs      = Date.now()
      return (nowMs - lastUpdate.getTime()) / 3_600_000
    } catch (err) {
      console.error(`[DistributionShiftDetector] getGraphStalenessHours unexpected error:`, err)
      return Infinity
    }
  }

  /**
   * Build a DomainDistributionWindow for a single domain from in-memory fingerprint rows.
   * Computes top keywords using TF-IDF: term frequency in domain weighted by
   * inverse document frequency across all domains.
   *
   * @param domain       - Domain to summarise
   * @param all          - All fingerprint rows in the rolling window
   * @param totalQueries - Total fingerprint count across all domains
   * @param windowStart  - Start of the rolling window
   * @param windowEnd    - End of the rolling window (now)
   * @returns DomainDistributionWindow for this domain
   */
  private async buildDomainWindow(
    domain:       QueryDomain,
    all:          FingerprintRow[],
    totalQueries: number,
    windowStart:  Date,
    windowEnd:    Date
  ): Promise<DomainDistributionWindow> {
    const domainRows = all.filter(r => r.domain === domain)
    const totalForDomain = domainRows.length

    // Collect all keyword tokens in this domain
    const domainTermFreq = new Map<string, number>()
    for (const row of domainRows) {
      for (const kw of row.keywords) {
        domainTermFreq.set(kw, (domainTermFreq.get(kw) ?? 0) + 1)
      }
    }

    // IDF: how many other domains also contain this term
    const allTermsSet = new Set(domainTermFreq.keys())
    const idf = new Map<string, number>()
    for (const term of allTermsSet) {
      const domainsWithTerm = ALL_DOMAINS.filter(d =>
        all.filter(r => r.domain === d).some(r => r.keywords.includes(term))
      ).length
      // IDF = log(numDomains / (1 + domainsWithTerm))
      idf.set(term, Math.log(ALL_DOMAINS.length / (1 + domainsWithTerm)))
    }

    // TF-IDF score and top 10
    const tfidfScores = Array.from(domainTermFreq.entries()).map(([term, tf]) => ({
      term,
      frequency: tf,
      tfidf: tf * (idf.get(term) ?? 0),
    }))
    tfidfScores.sort((a, b) => b.tfidf - a.tfidf)

    const topKeywords = tfidfScores.slice(0, 10).map(({ term, frequency }) => ({ term, frequency }))

    const lastGraphUpdate = await this.getLastGraphUpdate(domain)

    return {
      domain,
      window_start:      windowStart,
      window_end:        windowEnd,
      total_queries:     totalForDomain,
      query_proportion:  totalQueries > 0 ? totalForDomain / totalQueries : 0,
      top_keywords:      topKeywords,
      avg_delta_score:   0, // Populated separately if delta scores are tracked
      last_graph_update: lastGraphUpdate,
    }
  }

  /**
   * Fetch the most recent `updated_at` timestamp for wm_knowledge_nodes
   * belonging to the given domain. Returns the current time if no nodes exist
   * (conservative: avoids false staleness alerts for brand-new domains).
   *
   * @param domain - QueryDomain
   * @returns Date of last graph update for this domain
   */
  private async getLastGraphUpdate(domain: QueryDomain): Promise<Date> {
    try {
      const { data, error } = await this.supabase
        .from('wm_knowledge_nodes')
        .select('updated_at')
        .eq('metadata->>domain', domain)
        .order('updated_at', { ascending: false })
        .limit(1)

      if (error || !data || (data as KnowledgeNodeRow[]).length === 0) {
        return new Date() // no nodes → treat as fresh to avoid spurious alerts
      }

      return new Date((data as KnowledgeNodeRow[])[0].updated_at)
    } catch {
      return new Date()
    }
  }

  /**
   * Map a raw Supabase DB row to a typed KnowledgeStalenessEvent.
   *
   * @param row - Raw row from wm_staleness_events
   * @returns Typed KnowledgeStalenessEvent
   */
  private rowToStalenessEvent(row: StalenessEventRow): KnowledgeStalenessEvent {
    return {
      id:                   row.id,
      created_at:           new Date(row.created_at),
      domain:               row.domain as QueryDomain,
      js_divergence:        row.js_divergence,
      graph_staleness_hours: row.graph_staleness_hours,
      severity:             row.severity as KnowledgeStalenessEvent['severity'],
      recommended_action:   row.recommended_action as KnowledgeStalenessEvent['recommended_action'],
      resolved_at:          row.resolved_at ? new Date(row.resolved_at) : undefined,
      resolved_by:          row.resolved_by ?? undefined,
    }
  }
}
