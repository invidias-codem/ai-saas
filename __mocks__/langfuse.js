// Manual mock for the `langfuse` package. The real package's CJS entry delegates
// to `langfuse-core`, which performs a top-level dynamic `import()` that crashes
// Jest's VM with ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG (no
// --experimental-vm-modules). Any module that transitively imports `langfuse`
// (e.g. lib/observability/langfuse -> conversationEngine / UcolSpan) triggers the
// crash at module-load time, before `describe.skip` can take effect.
//
// Provide a no-op constructor so `getLangfuseClient()` can still instantiate it
// when env keys are present, without ever touching the real langfuse ESM graph.
function Langfuse(_config) {
  this.config = _config || {};
}

Langfuse.prototype.trace = function () {
  return new Proxy(
    {},
    {
      get: function () {
        return function () {
          return {};
        };
      },
    },
  );
};
Langfuse.prototype.span = function () {
  return this.trace();
};
Langfuse.prototype.generation = function () {
  return this.trace();
};
Langfuse.prototype.event = function () {
  return this.trace();
};
Langfuse.prototype.flushAsync = function () {
  return Promise.resolve();
};
Langfuse.prototype.shutdownAsync = function () {
  return Promise.resolve();
};

module.exports = {
  Langfuse: Langfuse,
  default: Langfuse,
};