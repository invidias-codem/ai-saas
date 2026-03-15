/**
 * Unit tests for /api/feedback route.
 *
 * These tests mock NextResponse + Supabase + Clerk + rate limiter to avoid external calls.
 */

// Mock next/server before importing the route module
jest.mock("next/server", () => {
  return {
    NextResponse: {
      json: (body: any, init?: ResponseInit) => {
        return new Response(JSON.stringify(body), {
          status: init?.status ?? 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  };
});

import { POST } from "@/app/api/feedback/route";

jest.mock("@/lib/supabaseClient", () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

jest.mock("@clerk/nextjs/server", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/security/rateLimit", () => ({
  limitFeedback: jest.fn(),
}));

const { supabaseAdmin } = jest.requireMock("@/lib/supabaseClient");
const { auth } = jest.requireMock("@clerk/nextjs/server");
const { limitFeedback } = jest.requireMock("@/lib/security/rateLimit");

describe("POST /api/feedback", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  function makeReq(body: any, headers?: Record<string, string>) {
    return new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(headers ?? {}),
      },
      body: JSON.stringify(body),
    });
  }

  test("returns 400 for invalid payload", async () => {
    // invalid: rating must be int, not string
    const res = await POST(makeReq({ rating: "nope" } as any));
    expect(res.status).toBe(400);
  });

  test("returns 429 when rate limit exceeded", async () => {
    auth.mockResolvedValue({ userId: null });
    limitFeedback.mockResolvedValue({
      success: false,
      reset: 123,
      remaining: 0,
      limit: 20,
    });

    const res = await POST(makeReq({ source: "web", rating: -1, feedbackText: "x" }));
    expect(res.status).toBe(429);
  });

  test("returns 500 when supabase insert fails", async () => {
    auth.mockResolvedValue({ userId: "user_123" });
    limitFeedback.mockResolvedValue({
      success: true,
      reset: 0,
      remaining: 19,
      limit: 20,
    });

    const single = jest.fn().mockResolvedValue({ data: null, error: { message: "db down" } });
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    supabaseAdmin.from.mockReturnValue({ insert });

    const res = await POST(makeReq({ source: "web", rating: -1, feedbackText: "x" }));
    expect(res.status).toBe(500);
  });

  test("returns 201 and scrubs obvious secrets", async () => {
    auth.mockResolvedValue({ userId: null });
    limitFeedback.mockResolvedValue({
      success: true,
      reset: 0,
      remaining: 19,
      limit: 20,
    });

    const single = jest.fn().mockResolvedValue({ data: { id: "uuid-1" }, error: null });
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    supabaseAdmin.from.mockReturnValue({ insert });

    const res = await POST(
      makeReq(
        {
          source: "web",
          rating: -1,
          input: "email me at test@example.com",
          output: "Bearer sk-123456789012345678901234567890123",
          feedbackText: "call +1 555-123-4567",
          metadata: { token: "sb_secret_123456789012345678901234567890" },
        },
        { "x-forwarded-for": "203.0.113.1" }
      )
    );

    expect(res.status).toBe(201);

    // Ensure insert received scrubbed values
    expect(insert).toHaveBeenCalledTimes(1);
    const insertedArg = (insert.mock.calls[0] as any[])?.[0];
    expect(insertedArg).toBeDefined();
    if (!insertedArg) return;

    expect(insertedArg.input).toContain("[REDACTED_EMAIL]");
    expect(insertedArg.output).toContain("[REDACTED_SECRET]");
    expect(insertedArg.feedback_text).toContain("[REDACTED_PHONE]");
    expect((insertedArg.metadata as any).token).toContain("[REDACTED_SECRET]");
  });
});
