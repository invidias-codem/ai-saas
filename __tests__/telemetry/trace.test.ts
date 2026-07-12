import { newTrace, newSpan, generateTraceContext } from "@/lib/telemetry/trace";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPAN_RE = /^[0-9a-f]{16}$/i;

describe("trace context", () => {
  it("newTrace produces a root span with null parent", () => {
    const t = newTrace();
    expect(t.trace_id).toMatch(UUID_RE);
    expect(t.span_id).toMatch(SPAN_RE);
    expect(t.parent_span_id).toBeNull();
  });

  it("newSpan preserves trace_id and chains parent_span_id", () => {
    const root = newTrace();
    const child = newSpan(root);
    expect(child.trace_id).toBe(root.trace_id);
    expect(child.parent_span_id).toBe(root.span_id);
    expect(child.span_id).not.toBe(root.span_id);
    expect(child.span_id).toMatch(SPAN_RE);
  });

  it("newSpan chains arbitrarily deep", () => {
    const root = newTrace();
    const a = newSpan(root);
    const b = newSpan(a);
    expect(b.trace_id).toBe(root.trace_id);
    expect(b.parent_span_id).toBe(a.span_id);
  });

  it("generateTraceContext(parentSpanId) sets the supplied parent", () => {
    const t = generateTraceContext("deadbeefcafebabe");
    expect(t.parent_span_id).toBe("deadbeefcafebabe");
    expect(t.trace_id).toMatch(UUID_RE);
  });

  it("generateTraceContext() with no arg is a root", () => {
    const t = generateTraceContext();
    expect(t.parent_span_id).toBeNull();
  });

  it("generated ids are unique across calls", () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => newTrace().trace_id)
    );
    expect(ids.size).toBe(50);
  });
});
