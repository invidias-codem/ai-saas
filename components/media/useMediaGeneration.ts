"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { ReplicatePrediction, GenerationStatus } from "./types";

interface UseMediaGenerationOptions {
  /** POST endpoint that starts the prediction (video/music). */
  submitUrl: string;
  /** Poll endpoint template; `${id}` is replaced with the prediction id. */
  pollUrlTemplate: string;
  /** Called with the terminal prediction on success. */
  onSucceeded?: (prediction: ReplicatePrediction) => void;
  /** Called with a human-readable message on failure. */
  onFailed?: (message: string) => void;
}

/**
 * Shared async generation dispatch: POST to start a Replicate prediction, then
 * a 3s polling loop with a `starting → processing → succeeded/failed/canceled`
 * state machine.
 *
 * Extracted from video/music content.tsx (M4). Image's transport is
 * synchronous (POST returns `{ images }` directly, no poll) and is deliberately
 * NOT folded in — see note in the media tracer-bullet spec. The hook owns the
 * generation status (`status`/`isLoading`) and delegates terminal results to
 * `onSucceeded`/`onFailed`, so each surface keeps its own result state and
 * error-message nuances.
 */
export function useMediaGeneration({
  submitUrl,
  pollUrlTemplate,
  onSucceeded,
  onFailed,
}: UseMediaGenerationOptions) {
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [predictionId, setPredictionId] = useState<string | null>(null);

  // Ref-hold the callbacks so the poll interval's closure stays fresh.
  const onSucceededRef = useRef(onSucceeded);
  onSucceededRef.current = onSucceeded;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;

  const isLoading = status === "generating";

  /** Start a prediction; resolves when it reaches a terminal state via callbacks. */
  const start = async (
    values: unknown,
    handleSubmitError?: (err: any) => string
  ): Promise<void> => {
    setStatus("generating");
    setPredictionId(null);

    try {
      const response = await axios.post<ReplicatePrediction>(submitUrl, values);
      const prediction = response.data;

      if (prediction && prediction.id) {
        setPredictionId(prediction.id);
      } else {
        throw new Error("API response did not contain a prediction ID.");
      }
    } catch (err: any) {
      console.error("[MEDIA_GEN_SUBMIT_ERROR]", err);
      const message = handleSubmitError
        ? handleSubmitError(err)
        : err?.response?.data?.details || "Sorry, something went wrong starting generation.";
      onFailedRef.current?.(message);
      setStatus("failed");
    }
  };

  // Polling loop.
  useEffect(() => {
    if (!predictionId) return;

    const interval = setInterval(async () => {
      try {
        const url = pollUrlTemplate.replace("${id}", predictionId);
        const response = await axios.get<ReplicatePrediction>(url);
        const prediction = response.data;

        switch (prediction.status) {
          case "succeeded":
            setPredictionId(null);
            setStatus("completed");
            onSucceededRef.current?.(prediction);
            clearInterval(interval);
            break;
          case "failed":
          case "canceled":
            setPredictionId(null);
            setStatus("failed");
            onFailedRef.current?.(prediction.error?.detail || "Generation failed.");
            clearInterval(interval);
            break;
          case "starting":
          case "processing":
            // Still generating; keep polling.
            break;
        }
      } catch (err: any) {
        console.error("[MEDIA_GEN_POLL_ERROR]", err);
        setPredictionId(null);
        setStatus("failed");
        onFailedRef.current?.("Failed to get status. Please try again.");
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [predictionId, pollUrlTemplate]);

  return {
    status,
    isLoading,
    predictionId,
    start,
  };
}