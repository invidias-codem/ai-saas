import { Langfuse } from "langfuse";
import { env } from "@/lib/env";

let _langfuse: Langfuse | null = null;

export function getLangfuseClient(): Langfuse {
  if (!_langfuse) {
    _langfuse = new Langfuse({
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_HOST,
    });
  }
  return _langfuse;
}

export type TraceOptions = {
  traceName?: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export function createTrace(opts: TraceOptions) {
  const client = getLangfuseClient();
  return client.trace(opts);
}
