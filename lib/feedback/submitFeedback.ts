export type FeedbackRating = 1 | -1;

export type SubmitFeedbackParams = {
  conversationId?: string | null;
  messageId?: string | null;
  input: string;
  output: string;
  rating: FeedbackRating;
  labels?: string[];
  promptVersion?: string;
  model?: string;
  retrievalContextIds?: string[];
  metadata?: Record<string, unknown>;

  /** Optional override; defaults to 'web' */
  source?: string;
};

/**
 * Client helper to submit feedback events.
 *
 * Best-effort: never throws (returns boolean success).
 */
export async function submitFeedback(params: SubmitFeedbackParams): Promise<boolean> {
  try {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: params.source ?? "web",
        conversationId: params.conversationId ?? undefined,
        messageId: params.messageId ?? undefined,
        promptVersion: params.promptVersion ?? undefined,
        model: params.model ?? undefined,
        input: params.input,
        output: params.output,
        rating: params.rating,
        feedbackText: undefined,
        labels: params.labels ?? [],
        retrievalContextIds: params.retrievalContextIds ?? [],
        metadata: params.metadata ?? {},
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}
