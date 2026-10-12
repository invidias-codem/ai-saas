import { withAbort, abortableStream } from './abort';

describe('request cancellation', () => {
  test('a stalled operation rejects when the deadline expires', async () => {
    const controller = new AbortController();
    const pending = withAbort(new Promise(() => {}), controller.signal);
    const assertion = expect(pending).rejects.toThrow('deadline');
    controller.abort(new Error('deadline'));
    await assertion;
  });

  test('cancels a stalled body and runs cleanup once', async () => {
    const cancel = jest.fn();
    const cleanup = jest.fn();
    const controller = new AbortController();
    const stream = abortableStream(new ReadableStream({ cancel }), controller.signal, cleanup);
    const reader = stream.getReader();
    const pending = expect(reader.read()).rejects.toThrow('deadline');
    controller.abort(new Error('deadline'));
    await pending;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test('preserves bytes and cleans up on normal completion', async () => {
    const cleanup = jest.fn();
    const upstream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([42])); c.close(); } });
    const stream = abortableStream(upstream, new AbortController().signal, cleanup);
    const reader = stream.getReader();
    expect(await reader.read()).toEqual({ done: false, value: new Uint8Array([42]) });
    expect((await reader.read()).done).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test('consumer disconnect cancels the upstream reader', async () => {
    const cancel = jest.fn();
    const stream = abortableStream(new ReadableStream({ cancel }), new AbortController().signal);
    await stream.cancel('disconnected');
    expect(cancel).toHaveBeenCalledWith('disconnected');
  });
});
