import { abortableStream, createDeadline, withAbort } from './abort';

/** Bound setup and body consumption with the same deadline, without resetting at headers. */
export async function withRequestDeadline(
  handle: (signal: AbortSignal) => Promise<Response>,
  options: {
    signal?: AbortSignal;
    timeoutMs: number;
    /** Optional terminal protocol message when an already-started response times out. */
    streamError?: (error: unknown) => Uint8Array;
  },
): Promise<Response> {
  const deadline = createDeadline(options.timeoutMs, options.signal);
  try {
    const pending = handle(deadline.signal);
    // A dependency may ignore cancellation and deliver headers late.
    void pending.then(response => {
      if (deadline.signal.aborted) void response.body?.cancel(deadline.signal.reason).catch(() => {});
    }, () => {});
    const response = await withAbort(pending, deadline.signal);
    deadline.signal.throwIfAborted();
    if (!response.body) { deadline.dispose(); return response; }
    const source = abortableStream(response.body, deadline.signal, deadline.dispose);
    const reader = source.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) { controller.close(); reader.releaseLock(); }
          else controller.enqueue(value);
        } catch (error) {
          reader.releaseLock();
          if (deadline.signal.aborted && options.streamError && !options.signal?.aborted) {
            controller.enqueue(options.streamError(error));
            controller.close();
          } else controller.error(error);
        }
      },
      cancel(reason) {
        deadline.abort(reason);
        deadline.dispose();
        void reader.cancel(reason).catch(() => {}).finally(() => reader.releaseLock());
      },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) {
    deadline.dispose();
    throw error;
  }
}
