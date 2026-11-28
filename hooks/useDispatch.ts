"use client";

import { useCallback, useState } from "react";

export type FrontendState =
  | "IDLE"
  | "LOADING"
  | "DISPATCHED"
  | "BORDERLINE_UI"
  | "HARD_BLOCK_TERMINAL";

export interface DispatchEnvelope {
  decision: "DISPATCHED" | "DEGRADED" | "HARD_BLOCK";
  personaState: string;
  criticDecision: "PASS" | "BORDERLINE" | "HARD_BLOCK";
  causalViolations: Array<{
    namespaceRule: string;
    thresholdDelta: number;
    driftDescription: string;
  }>;
  auditNonce: string;
  timestamp: string;
  response?: string | null;
  degradedReason?: string;
  terminalReason?: string;
  router?: {
    tier: "BASE" | "STANDARD" | "HIGH_COMPUTE";
    provider: string;
    model: string;
  };
}

export interface DispatchPayload {
  taskType: string;
  prompt: string;
  candidateOutput: string;
  contextTokens: number;
  sessionId: string;
}

export function useDispatch() {
  const [state, setState] = useState<FrontendState>("IDLE");
  const [envelope, setEnvelope] = useState<DispatchEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dispatch = useCallback(async (payload: DispatchPayload) => {
    setState("LOADING");
    setEnvelope(null);
    setError(null);

    try {
      const res = await fetch("/api/weaver/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({
        error: `Dispatch failed (${res.status})`,
      }))) as DispatchEnvelope | { error: string };

      if (!res.ok || "error" in data) {
        const msg = "error" in data ? data.error : `Dispatch failed (${res.status})`;
        setError(msg);
        setState("IDLE");
        return;
      }

      setEnvelope(data);

      switch (data.decision) {
        case "DISPATCHED":
          setState("DISPATCHED");
          break;
        case "DEGRADED":
          setState("BORDERLINE_UI");
          break;
        case "HARD_BLOCK":
          setState("HARD_BLOCK_TERMINAL");
          break;
        default:
          setState("IDLE");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      setState("IDLE");
    }
  }, []);

  const reset = useCallback(() => {
    setState("IDLE");
    setEnvelope(null);
    setError(null);
  }, []);

  const elevatedRetry = useCallback(
    async (interceptNonce: string, candidateOutput: string) => {
      setState("LOADING");
      setEnvelope(null);
      setError(null);

      try {
        const res = await fetch("/api/weaver/retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interceptNonce, candidateOutput }),
        });

        const data = (await res.json().catch(() => ({
          error: `Retry failed (${res.status})`,
        }))) as DispatchEnvelope | { error: string };

        if (!res.ok || "error" in data) {
          const msg = "error" in data ? data.error : `Retry failed (${res.status})`;
          setError(msg);
          setState("IDLE");
          return;
        }

        setEnvelope(data);

        switch (data.decision) {
          case "DISPATCHED":
            setState("DISPATCHED");
            break;
          case "HARD_BLOCK":
            setState("HARD_BLOCK_TERMINAL");
            break;
          default:
            setState("IDLE");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error";
        setError(msg);
        setState("IDLE");
      }
    },
    [],
  );

  return {
    state,
    envelope,
    dispatch,
    elevatedRetry,
    reset,
    isLoading: state === "LOADING",
    error,
  };
}
