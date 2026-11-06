/**
 * slackTelemetry.ts — Structured, redacted telemetry for Slack events
 * Replaces console.log with structured events. No PII in message text.
 */

import { logger } from '@/lib/logger'

export type SlackTelemetryEventType =
  | 'slack_event_received'
  | 'slack_event_dispatched'
  | 'slack_stream_started'
  | 'slack_stream_completed'
  | 'slack_stream_failed'
  | 'slack_auth_failed'
  | 'slack_signature_invalid'
  | 'slack_retry_ignored'
  | 'slack_retry_received'
  | 'slack_config_resolved'
  | 'slack_config_missing'
  | 'slack_handler_error'

export interface SlackTelemetryEvent {
  type: SlackTelemetryEventType
  teamId: string
  eventType: string
  channelId: string
  threadTs: string
  userId: string
  routingDecision?: 'conversational' | 'agentic' | 'specialized' | 'unknown'
  durationMs?: number
  error?: string
  metadata?: Record<string, unknown>
}

const REDACTED_FIELDS = new Set([
  'text', 'content', 'prompt', 'response', 'message',
  'body', 'payload', 'user', 'email', 'password',
  'token', 'secret', 'key', 'authorization', 'cookie',
  'headers', 'authorization', 'x-slack-signature', 'x-slack-request-timestamp'
])

const REDACTED_NESTED_PATHS = new Set([
  'event.text', 'event.content', 'event.prompt', 'event.response', 'event.message',
  'event.body', 'event.payload', 'event.event', 'event.user', 'event.email',
  'event.user.id', 'event.user.email',
  'metadata.text', 'metadata.content', 'metadata.prompt', 'metadata.response', 'metadata.message',
  'metadata.event.text', 'metadata.event.user', 'metadata.event.email', 'metadata.event.id'
])

function deepRedact(obj: unknown, path = ''): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') {
    if (obj.length > 500) return obj.slice(0, 497) + '…'
    return obj
  }
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    return obj.map((item, idx) => deepRedact(item, `${path}[${idx}]`))
  }
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullPath = path ? `${path}.${key}` : key
    if (REDACTED_FIELDS.has(key.toLowerCase()) || REDACTED_NESTED_PATHS.has(fullPath.toLowerCase())) {
      clean[key] = '[REDACTED]'
    } else {
      clean[key] = deepRedact(value, fullPath)
    }
  }
  return clean
}

function redactEvent(event: SlackTelemetryEvent): SlackTelemetryEvent {
  const clean: SlackTelemetryEvent = { ...event }
  // Redact error message if present
  if (clean.error) {
    clean.error = String(clean.error).slice(0, 200)
  }
  if (clean.metadata) {
    clean.metadata = deepRedact(clean.metadata, 'metadata') as Record<string, unknown>
  }
  return clean
}

/**
 * Emits a structured Slack telemetry event.
 * Non-blocking — failures are logged but never thrown.
 */
export function emitSlackTelemetry(event: SlackTelemetryEvent): void {
  try {
    const clean = redactEvent(event)
    logger.info('[SlackTelemetry]', clean)
    // Future: forward to structured backend (Datadog, OpenTelemetry, etc.)
  } catch (e) {
    // Telemetry must never break the hot path
    console.error('[SlackTelemetry] emit failed:', e)
  }
}

/**
 * Convenience wrapper for handler execution with telemetry.
 */
export async function withSlackTelemetry<T>(
  event: SlackTelemetryEvent,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now()
  try {
    emitSlackTelemetry({ ...event, type: 'slack_event_dispatched' })
    const result = await fn()
    emitSlackTelemetry({
      ...event,
      type: 'slack_stream_completed',
      durationMs: Date.now() - start
    })
    return result
  } catch (error) {
    emitSlackTelemetry({
      ...event,
      type: 'slack_stream_failed',
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}

/**
 * Extracts standard Slack event fields for telemetry.
 * Returns a complete SlackTelemetryEvent with empty string defaults for missing fields.
 */
export function extractTelemetryFields(config: { teamId: string; botUserId: string }, event: any): SlackTelemetryEvent {
  return {
    type: 'slack_event_received', // default, callers should override
    teamId: config.teamId,
    eventType: event.type || 'unknown',
    channelId: event.channel || event.channel_id || '',
    threadTs: event.thread_ts || event.ts || '',
    userId: event.user || ''
  }
}