/** Bound an await even when a dependency cannot consume an AbortSignal. */
export function withAbort<T>(operation: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(operation);
  return new Promise<T>((resolve, reject) => {
    const aborted = () => {
      signal.removeEventListener('abort', aborted);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', aborted, { once: true });
    // Always observe the operation, including when the signal is already aborted.
    Promise.resolve(operation).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', aborted);
    });
    if (signal.aborted) aborted();
  });
}

/** Keep cancellation attached through the response body, not just its headers. */
export function abortableStream<T>(
  source: ReadableStream<T>, signal: AbortSignal, onFinish: () => void = () => {},
  terminalChunk?: () => T | undefined,
): ReadableStream<T> {
  const reader = source.getReader();
  let finished = false;
  let onAbort: () => void;
  const finish = () => {
    if (finished) return;
    finished = true;
    signal.removeEventListener('abort', onAbort);
    onFinish();
  };
  const cancel = (reason: unknown) => {
    void reader.cancel(reason).catch(() => {}).finally(() => reader.releaseLock());
  };
  return new ReadableStream<T>({
    start(controller) {
      onAbort = () => {
        if (finished) return;
        finish();
        const chunk = terminalChunk?.();
        if (chunk !== undefined) { controller.enqueue(chunk); controller.close(); }
        else controller.error(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        cancel(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (finished) return;
        if (done) {
          finish();
          reader.releaseLock();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        if (finished) return;
        finish();
        reader.releaseLock();
        controller.error(error);
      }
    },
    cancel(reason) {
      if (finished) return;
      finish();
      cancel(reason);
    },
  });
}

/** A disposable wall-clock deadline; keep it alive until the response body ends. */
export function createDeadline(timeoutMs: number, parent?: AbortSignal, reason = 'request_deadline') {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid deadline duration');
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(parent?.reason);
  const timer = setTimeout(() => controller.abort(new Error(reason)), timeoutMs);
  parent?.addEventListener('abort', forwardAbort, { once: true });
  if (parent?.aborted) forwardAbort();
  return {
    signal: controller.signal,
    abort: (cause?: unknown) => controller.abort(cause),
    clearTimer: () => clearTimeout(timer),
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', forwardAbort);
    },
  };
}
