/* public/sw-telemetry.js
 * Sovereign AI Telemetry — client-side Service Worker (Phase 2.2).
 *
 * Intercepts /api/chat and /api/code requests. It reads the requested model
 * from the request body (mode) and the actual model + provider from response
 * headers the server sets (x-telemetry-model / x-telemetry-provider), builds a
 * minimal UDIF 2.0 interaction-audit record, and writes it to the sovereign
 * IndexedDB ledger. The streamed response body is NEVER consumed (we clone).
 *
 * This is the PRD's intended "Service Worker for OTel network interception"
 * path — telemetry is captured at the edge without touching app code.
 */

const DB_NAME = "lattice-telemetry";
const STORE = "udif_ledger";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function uuid() {
  if (self.crypto && self.crypto.randomUUID) return self.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function spanId() {
  return uuid().replace(/-/g, "").slice(0, 16);
}

function openLedger() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "trace_context.trace_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persist(record) {
  try {
    const db = await openLedger();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const key = record.trace_context.trace_id + ":" + record.trace_context.span_id;
      tx.objectStore(STORE).put({ ...record, _spanKey: key });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    /* non-blocking */
  }
}

async function readBodyMode(request) {
  // Best-effort: parse mode from JSON body without consuming the stream.
  try {
    const clone = request.clone();
    const ct = clone.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    const body = await clone.json();
    return body?.mode || body?.messages?.[body.messages.length - 1]?.mode || null;
  } catch {
    return null;
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isTarget = url.pathname.endsWith("/api/chat") || url.pathname.endsWith("/api/code");
  if (event.request.method !== "POST" || !isTarget) return;

  const requestedMode = readBodyMode(event.request);

  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        const actualModel = response.headers.get("x-telemetry-model");
        const provider = response.headers.get("x-telemetry-provider");
        if (actualModel) {
          const trace_id = uuid();
          const record = {
            udif_version: "2.0",
            record_type: "ai_interaction_audit",
            timestamp: new Date().toISOString(),
            trace_context: { trace_id, span_id: spanId(), parent_span_id: null },
            context_baggage: { content_mode: "metadata" },
            ai_ledger: {
              system_provider: provider || "unknown",
              "gen_ai.request.model": requestedMode || "unknown",
              "gen_ai.response.model": actualModel,
              agent_identity: { name: requestedMode || "chat", role: isTarget ? "chat" : "code" },
            },
          };
          persist(record);
        }
        return response;
      })
      .catch((err) => {
        return new Response(JSON.stringify({ error: "telemetry_sw_error", detail: String(err) }), {
          status: 502,
          headers: { "content-type": "application/json" },
        });
      })
  );
});
