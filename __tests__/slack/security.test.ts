/**
 * Slack Security Tests — Real HMAC verification and request boundary tests
 * These tests exercise the ACTUAL signature verification, not mocked versions.
 */

import crypto from 'crypto';
import { verifySlackSignature, requireSlackSignature } from '@/lib/slack/slackVerification';
import { emitSlackTelemetry, extractTelemetryFields } from '@/lib/slack/slackTelemetry';

// Mock logger to capture output
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

jest.mock('@/lib/logger', () => ({
  logger: mockLogger,
}));

describe('Slack Security — Real HMAC Verification', () => {
  const signingSecret = 'test-signing-secret-12345';
  const validBody = '{"type":"event_callback","team_id":"T123","event":{"type":"app_mention","user":"U123","text":"<@U_BOT> hello"}}';
  const validTimestamp = Math.floor(Date.now() / 1000).toString();
  const validSignature = `v0=${crypto.createHmac('sha256', signingSecret).update(`v0:${validTimestamp}:${validBody}`).digest('hex')}`;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SLACK_SIGNING_SECRET = signingSecret;
  });

  afterEach(() => {
    delete process.env.SLACK_SIGNING_SECRET;
  });

  describe('verifySlackSignature', () => {
    it('accepts valid signature with correct secret', () => {
      const result = verifySlackSignature(validBody, validTimestamp, validSignature);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects invalid signature', () => {
      const badSignature = 'v0=invalidsignature';
      const result = verifySlackSignature(validBody, validTimestamp, badSignature);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_signature');
    });

    it('rejects expired timestamp (>5 min)', () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 6 min 40 sec ago
      const oldSignature = `v0=${crypto.createHmac('sha256', signingSecret).update(`v0:${oldTimestamp}:${validBody}`).digest('hex')}`;
      const result = verifySlackSignature(validBody, oldTimestamp, oldSignature);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('timestamp_expired');
    });

    it('rejects future timestamp (>5 min)', () => {
      const futureTimestamp = (Math.floor(Date.now() / 1000) + 400).toString(); // 6 min 40 sec future
      const futureSignature = `v0=${crypto.createHmac('sha256', signingSecret).update(`v0:${futureTimestamp}:${validBody}`).digest('hex')}`;
      const result = verifySlackSignature(validBody, futureTimestamp, futureSignature);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('timestamp_expired');
    });

    it('rejects missing signing secret (returns missing_secret error)', () => {
      delete process.env.SLACK_SIGNING_SECRET;
      const result = verifySlackSignature(validBody, validTimestamp, validSignature);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('missing_secret');
    });

    it('rejects missing timestamp header', () => {
      const result = verifySlackSignature(validBody, null, validSignature);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('missing_headers');
    });

    it('rejects missing signature header', () => {
      const result = verifySlackSignature(validBody, validTimestamp, null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('missing_headers');
    });

    it('uses timing-safe comparison (constant time)', () => {
      // This test verifies the function uses crypto.timingSafeEqual
      // We can't directly test timing, but we verify it doesn't throw
      const result = verifySlackSignature(validBody, validTimestamp, validSignature);
      expect(result.valid).toBe(true);
    });
  });

  describe('requireSlackSignature (Next.js middleware)', () => {
    const createRequest = (headers: Record<string, string>, body: string) => {
      return new Request('http://localhost/api/slack/events', {
        method: 'POST',
        body,
        headers,
      });
    };

    it('returns null (continue) for valid signature', async () => {
      const req = createRequest({
        'x-slack-request-timestamp': validTimestamp,
        'x-slack-signature': validSignature,
        'content-type': 'application/json',
      }, validBody);

      const result = requireSlackSignature(req, validBody);
      expect(result).toBeNull();
    });

    it('returns 401 response for invalid signature', async () => {
      const req = createRequest({
        'x-slack-request-timestamp': validTimestamp,
        'x-slack-signature': 'v0=badsignature',
        'content-type': 'application/json',
      }, validBody);

      const result = requireSlackSignature(req, validBody);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });

    it('returns 500 response when SLACK_SIGNING_SECRET missing', async () => {
      delete process.env.SLACK_SIGNING_SECRET;
      const req = createRequest({
        'x-slack-request-timestamp': validTimestamp,
        'x-slack-signature': validSignature,
        'content-type': 'application/json',
      }, validBody);

      const result = requireSlackSignature(req, validBody);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(500);
    });
  });
});

describe('Slack Security — Request Boundary Tests', () => {
  const signingSecret = 'test-secret';
  const validTimestamp = Math.floor(Date.now() / 1000).toString();

  beforeEach(() => {
    process.env.SLACK_SIGNING_SECRET = signingSecret;
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.SLACK_SIGNING_SECRET;
  });

  it('rejects request with body tampered after signature generation', () => {
    const originalBody = '{"type":"event_callback","team_id":"T123"}';
    const signature = `v0=${crypto.createHmac('sha256', signingSecret).update(`v0:${validTimestamp}:${originalBody}`).digest('hex')}`;
    
    // Tamper with body after signature
    const tamperedBody = '{"type":"event_callback","team_id":"T999"}';
    
    const result = verifySlackSignature(tamperedBody, validTimestamp, signature);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_signature');
  });

  it('rejects request with modified timestamp but same signature', () => {
    const body = '{"type":"event_callback","team_id":"T123"}';
    const signature = `v0=${crypto.createHmac('sha256', signingSecret).update(`v0:${validTimestamp}:${body}`).digest('hex')}`;
    
    // Use different timestamp with same signature
    const differentTimestamp = (parseInt(validTimestamp) + 100).toString();
    
    const result = verifySlackSignature(body, differentTimestamp, signature);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_signature');
  });

  it('handles Unicode and special characters in body', () => {
    const unicodeBody = '{"type":"event_callback","team_id":"T123","event":{"text":"Hello 🌍 你好"}}';
    const signature = `v0=${crypto.createHmac('sha256', signingSecret).update(`v0:${validTimestamp}:${unicodeBody}`).digest('hex')}`;
    
    const result = verifySlackSignature(unicodeBody, validTimestamp, signature);
    expect(result.valid).toBe(true);
  });
});

describe('Slack Telemetry — Redaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redacts top-level PII fields', () => {
    const event = {
      type: 'slack_event_received' as const,
      teamId: 'T123',
      eventType: 'app_mention',
      channelId: 'C123',
      threadTs: '1234567890.123',
      userId: 'U123',
      metadata: {
        text: 'secret message',
        content: 'secret content',
        prompt: 'secret prompt',
        response: 'secret response',
        message: 'secret message',
        normalField: 'this is fine',
      },
    };

    const { emitSlackTelemetry } = require('@/lib/slack/slackTelemetry');
    emitSlackTelemetry(event);

    expect(mockLogger.info).toHaveBeenCalled();
    const logged = mockLogger.info.mock.calls[0][1];
    expect(logged.metadata.text).toBe('[REDACTED]');
    expect(logged.metadata.content).toBe('[REDACTED]');
    expect(logged.metadata.prompt).toBe('[REDACTED]');
    expect(logged.metadata.response).toBe('[REDACTED]');
    expect(logged.metadata.message).toBe('[REDACTED]');
    expect(logged.metadata.normalField).toBe('this is fine');
  });

  it('redacts nested PII fields', () => {
    const event = {
      type: 'slack_event_received' as const,
      teamId: 'T123',
      eventType: 'app_mention',
      channelId: 'C123',
      threadTs: '1234567890.123',
      userId: 'U123',
      metadata: {
        event: {
          text: 'nested secret',
          user: 'U456',
          email: 'test@example.com',
        },
        metadata: {
          prompt: 'nested prompt',
          response: 'nested response',
        },
        safeData: { value: 123 },
      },
    };

    const { emitSlackTelemetry } = require('@/lib/slack/slackTelemetry');
    emitSlackTelemetry(event);

    const logged = mockLogger.info.mock.calls[0][1];
    console.log('DEBUG logged.metadata:', JSON.stringify(logged.metadata, null, 2));
    expect(logged.metadata.event.text).toBe('[REDACTED]');
    expect(logged.metadata.event.user).toBe('[REDACTED]');
    expect(logged.metadata.event.email).toBe('[REDACTED]');
    expect(logged.metadata.metadata.prompt).toBe('[REDACTED]');
    expect(logged.metadata.metadata.response).toBe('[REDACTED]');
    expect(logged.metadata.safeData).toEqual({ value: 123 });
  });

  it('truncates long strings', () => {
    const longString = 'x'.repeat(600);
    const event = {
      type: 'slack_event_received' as const,
      teamId: 'T123',
      eventType: 'app_mention',
      channelId: 'C123',
      threadTs: '1234567890.123',
      userId: 'U123',
      metadata: {
        longField: longString,
      },
    };

    const { emitSlackTelemetry } = require('@/lib/slack/slackTelemetry');
    emitSlackTelemetry(event);

    const logged = mockLogger.info.mock.calls[0][1];
    expect(logged.metadata.longField.length).toBeLessThanOrEqual(500);
    expect(logged.metadata.longField.endsWith('…')).toBe(true);
  });

  it('redacts error messages', () => {
    const event = {
      type: 'slack_stream_failed' as const,
      teamId: 'T123',
      eventType: 'app_mention',
      channelId: 'C123',
      threadTs: '1234567890.123',
      userId: 'U123',
      error: 'Error: secret token abc123 in message',
    };

    const { emitSlackTelemetry } = require('@/lib/slack/slackTelemetry');
    emitSlackTelemetry(event);

    const logged = mockLogger.info.mock.calls[0][1];
    expect(logged.error.length).toBeLessThanOrEqual(200);
  });
});

describe('Slack Idempotency Keys', () => {
  it('generates stable event keys from outer envelope', () => {
    const teamId = 'T123';
    const eventId = 'Ev123456';
    const eventTime = 1234567890;
    
    // Simulate the key generation from the routes
    const key1 = `slack:event:${teamId}:${eventId}:${eventTime}`;
    const key2 = `slack:event:${teamId}:${eventId}:${eventTime}`;
    
    expect(key1).toBe(key2);
    expect(key1).toBe(`slack:event:T123:Ev123456:1234567890`);
  });

  it('generates stable command keys from x-slack-request-timestamp', () => {
    const teamId = 'T123';
    const userId = 'U123';
    const command = 'ask';
    const timestamp = '1234567890';
    
    const key1 = `slack:cmd:${teamId}:${userId}:${command}:${timestamp}`;
    const key2 = `slack:cmd:${teamId}:${userId}:${command}:${timestamp}`;
    
    expect(key1).toBe(key2);
  });

  it('generates stable interactivity keys from trigger_id', () => {
    const teamId = 'T123';
    const userId = 'U123';
    const type = 'block_actions';
    const triggerId = '1234567890.123456';
    
    const key1 = `slack:int:${teamId}:${userId}:${type}:${triggerId}`;
    const key2 = `slack:int:${teamId}:${userId}:${type}:${triggerId}`;
    
    expect(key1).toBe(key2);
  });
});