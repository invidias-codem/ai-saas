import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Exercise the installed SDK in a separate process: the production defect is
// an uncaught microtask exception, which an in-process mock cannot reproduce.
describe('Trigger SDK stream lifecycle', () => {
  test.each(['commonjs', 'esm'])('%s closes once on abort, completion, and downstream cancellation', (format) => {
    const commonjsRoot = path.dirname(require.resolve('@trigger.dev/core/v3', { paths: [path.dirname(require.resolve('@trigger.dev/sdk'))] }));
    const modulePath = path.join(commonjsRoot.replace(`${path.sep}commonjs${path.sep}`, `${path.sep}${format}${path.sep}`), 'streams/asyncIterableStream.js');
    const script = `
      const assert = require('node:assert/strict');
      const { pathToFileURL } = require('node:url');
      (async () => {
        const { createAsyncIterableReadable } = await import(pathToFileURL(process.argv[1]).href);
        const tick = () => new Promise(resolve => setImmediate(resolve));
        for (const scenario of ['abort', 'cancel-abort', 'done-abort', 'pre-abort', 'snapshot-abort', 'error']) {
          const abort = new AbortController();
          let sourceController;
          let cancels = 0;
          const source = new ReadableStream({
            start(controller) { sourceController = controller; },
            cancel() { cancels++; },
          });
          if (scenario === 'pre-abort') abort.abort();
          const stream = createAsyncIterableReadable(source, {}, abort.signal);
          const reader = stream.getReader();
          if (scenario === 'snapshot-abort') {
            sourceController.enqueue({ status: 'COMPLETED' });
            assert.deepEqual((await reader.read()).value, { status: 'COMPLETED' });
          }
          const pending = reader.read();
          if (scenario === 'abort' || scenario === 'snapshot-abort') abort.abort();
          if (scenario === 'cancel-abort') { await reader.cancel(); abort.abort(); }
          if (scenario === 'done-abort') { sourceController.close(); await pending; abort.abort(); }
          if (scenario === 'error') {
            sourceController.error(new Error('upstream failed'));
            await assert.rejects(pending, /upstream failed/);
            abort.abort();
          } else {
            assert.equal((await pending).done, true);
          }
          await tick(); await tick();
          if (['abort', 'cancel-abort', 'pre-abort', 'snapshot-abort'].includes(scenario)) assert.equal(cancels, 1);
          assert.equal(source.locked, false);
          reader.releaseLock();
        }
        console.log('stream lifecycle passed');
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    expect(execFileSync(process.execPath, ['-e', script, modulePath], { encoding: 'utf8', timeout: 5000 })).toContain('stream lifecycle passed');
  });
});
