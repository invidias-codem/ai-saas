import { supabaseAdmin } from '@/lib/supabaseClient';

/**
 * Generic JSON-RPC bridge connecting the Next.js cloud execution layer to the 
 * local Go Daemon. 
 * 
 * Crucially, this bridge enforces the injection of trusted server-side context 
 * (WorkspaceID, UserID, AuthToken) to prevent the LLM from hallucinating or 
 * spoofing its scope.
 */

export async function executeLocalDaemonTool(
  method: string, 
  params: Record<string, any>,
  workspaceId: string,
  userId: string,
  authToken: string
): Promise<any> {
  const startTime = Date.now();
  const pathAccessed = params.path || params.src_path || '';
  
  const rpcPayload = {
    jsonrpc: "2.0",
    method,
    // Trust boundary: These fields are injected server-side, overriding any model input
    params: {
      ...params,
      workspace_id: workspaceId,
      user_id: userId,
      auth_token: authToken
    },
    id: Date.now()
  };

  // Helper to log Next.js-side telemetry
  const logTelemetry = async (eventType: string, success: boolean, errorMessage?: string) => {
    if (!supabaseAdmin) return;
    await supabaseAdmin.from('harness_telemetry_events').insert({
      workspace_id: workspaceId,
      user_id: userId,
      event_type: eventType,
      operation_type: method,
      path_accessed: pathAccessed,
      success,
      error_message: errorMessage,
      duration_ms: Date.now() - startTime
    });
  };

  await logTelemetry('tool_call_forwarded', true);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const res = await fetch("http://127.0.0.1:4000/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcPayload),
      signal: controller.signal
    });
    
    clearTimeout(timeout);

    if (!res.ok) {
      // e.g., 500 from the Go daemon
      const errText = await res.text();
      const errMsg = `Daemon HTTP Error ${res.status}: ${errText}`;
      await logTelemetry('daemon_rpc_error', false, errMsg);
      return { error: errMsg };
    }

    const data = await res.json();
    
    // Explicit Error Feedback Loop
    if (data.error) {
      const errMsg = `JSON-RPC Error: ${data.error.message || JSON.stringify(data.error)}`;
      if (errMsg.includes("403") || errMsg.includes("Forbidden") || errMsg.includes("Containment")) {
        await logTelemetry('tool_call_denied', false, errMsg);
      } else {
        await logTelemetry('tool_call_failed', false, errMsg);
      }
      return { error: errMsg };
    }

    await logTelemetry('tool_call_succeeded', true);
    return data.result;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      const errMsg = 'Daemon Connection Timeout: Request took longer than 10s';
      await logTelemetry('daemon_rpc_timeout', false, errMsg);
      return { error: errMsg };
    }
    const errMsg = `Daemon Connection Failed: Could not reach localhost. Is Lattice running? Error: ${err.message}`;
    await logTelemetry('daemon_rpc_error', false, errMsg);
    return { error: errMsg };
  }
}
