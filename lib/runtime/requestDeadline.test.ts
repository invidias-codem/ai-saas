import { withRequestDeadline } from './requestDeadline';

describe('request deadline across setup and streaming', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('setup cannot wait indefinitely for an uncooperative dependency', async () => {
    const pending = withRequestDeadline(() => new Promise<Response>(() => {}), { timeoutMs: 25 });
    const assertion = expect(pending).rejects.toThrow('request_deadline');
    await jest.advanceTimersByTimeAsync(26);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  test('setup time reduces the remaining stream budget; timeout closes with a terminal message', async () => {
    const cancel = jest.fn();
    const pending = withRequestDeadline(async () => {
      await new Promise(r => setTimeout(r, 20));
      return new Response(new ReadableStream({ cancel }), { headers: { 'x-test': 'preserved' } });
    }, { timeoutMs: 50, streamError: () => new TextEncoder().encode('timed out') });
    await jest.advanceTimersByTimeAsync(20);
    const response = await pending;
    const text = response.text();
    await jest.advanceTimersByTimeAsync(31);
    expect(await text).toBe('timed out');
    expect(response.headers.get('x-test')).toBe('preserved');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('late response bodies are cancelled after setup times out', async () => {
    let resolve!: (response: Response) => void;
    const pending = withRequestDeadline(() => new Promise<Response>(r => { resolve = r; }), { timeoutMs: 25 });
    const assertion = expect(pending).rejects.toThrow('request_deadline');
    await jest.advanceTimersByTimeAsync(26);
    await assertion;
    const cancel = jest.fn();
    resolve(new Response(new ReadableStream({ cancel })));
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('normal completion clears the deadline timer', async () => {
    const response = await withRequestDeadline(async () => new Response('ok'), { timeoutMs: 25 });
    expect(await response.text()).toBe('ok');
    expect(jest.getTimerCount()).toBe(0);
  });

  test('disconnect cancels a stalled body without waiting for the deadline', async () => {
    const cancel = jest.fn();
    const caller = new AbortController();
    const response = await withRequestDeadline(async () => new Response(new ReadableStream({ cancel })), { timeoutMs: 25, signal: caller.signal });
    const text = expect(response.text()).rejects.toThrow('disconnected');
    caller.abort(new Error('disconnected'));
    await text;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});

test('cancelling the response reader aborts the handler signal and cancels upstream', async () => {
  let signal!: AbortSignal;
  const cancel = jest.fn();
  const response = await withRequestDeadline(async current => {
    signal = current;
    return new Response(new ReadableStream({ cancel }));
  }, { timeoutMs: 50_000 });
  await response.body!.cancel('consumer gone');
  expect(signal.aborted).toBe(true);
  expect(cancel).toHaveBeenCalledTimes(1);
});
