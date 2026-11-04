/**
 * slackVerification.ts — Shared Slack request signature verification
 * Single source of truth for both Slack event routes.
 */

import crypto from 'crypto'

export interface SlackVerificationResult {
  valid: boolean
  error?: 'missing_secret' | 'missing_headers' | 'timestamp_expired' | 'invalid_signature'
}

const SLACK_TIMESTAMP_TOLERANCE_SEC = 300 // 5 minutes

/**
 * Verifies a Slack request signature using timing-safe comparison.
 * @param rawBody - Raw request body as string
 * @param timestamp - Value of x-slack-request-timestamp header
 * @param signature - Value of x-slack-signature header
 * @returns { valid: true } or { valid: false, error: reason }
 */
export function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null
): SlackVerificationResult {
  const signingSecret = process.env.SLACK_SIGNING_SECRET

  if (!signingSecret) {
    return { valid: false, error: 'missing_secret' }
  }

  if (!timestamp || !signature) {
    return { valid: false, error: 'missing_headers' }
  }

  const currentTime = Math.floor(Date.now() / 1000)
  const requestTime = parseInt(timestamp, 10)

  if (isNaN(requestTime) || Math.abs(currentTime - requestTime) > SLACK_TIMESTAMP_TOLERANCE_SEC) {
    return { valid: false, error: 'timestamp_expired' }
  }

  const baseString = `v0:${timestamp}:${rawBody}`
  const hmac = crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex')
  const expectedSignature = `v0=${hmac}`

  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
    return { valid, error: valid ? undefined : 'invalid_signature' }
  } catch {
    return { valid: false, error: 'invalid_signature' }
  }
}

/**
 * Middleware-style helper for Next.js routes.
 * Returns NextResponse on failure, null on success (continue processing).
 */
import { NextResponse } from 'next/server'

export function requireSlackSignature(
  req: Request,
  rawBody: string
): NextResponse | null {
  const timestamp = req.headers.get('x-slack-request-timestamp')
  const signature = req.headers.get('x-slack-signature')

  const result = verifySlackSignature(rawBody, timestamp, signature)

  if (!result.valid) {
    const status = result.error === 'missing_secret' ? 500 : 401
    const message = result.error === 'missing_secret'
      ? 'Server Configuration Error'
      : 'Unauthorized'

    return new NextResponse(message, { status })
  }

  return null
}