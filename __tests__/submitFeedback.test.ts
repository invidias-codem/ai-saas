import { describe, expect, it, jest, beforeEach, afterEach } from "@jest/globals";

import { submitFeedback } from "../lib/feedback/submitFeedback";

describe("submitFeedback", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns true when the API responds ok", async () => {
    (globalThis.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({ ok: true } as Response);

    const ok = await submitFeedback({
      input: "in",
      output: "out",
      rating: 1,
      source: "web",
    });

    expect(ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const [url, init] = (globalThis.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(url).toBe("/api/feedback");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      source: "web",
      input: "in",
      output: "out",
      rating: 1,
      labels: [],
      retrievalContextIds: [],
      metadata: {},
    });
  });

  it("returns false when fetch throws", async () => {
    (globalThis.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(new Error("network"));

    const ok = await submitFeedback({
      input: "in",
      output: "out",
      rating: -1,
    });

    expect(ok).toBe(false);
  });
});
