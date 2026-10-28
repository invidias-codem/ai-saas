package main

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/invidias-codem/ai-saas/go-harness/harness"
	"github.com/invidias-codem/ai-saas/go-harness/internal/nativeprotocol"
)

type nativeFrame struct {
	ID        string                    `json:"id"`
	Version   string                    `json:"jsonrpc"`
	AuthToken string                    `json:"authToken"`
	Action    string                    `json:"action"`
	Inputs    json.RawMessage           `json:"inputs"`
	Authority *nativeprotocol.Authority `json:"authority,omitempty"`
}

func nativeFailure(code string) harness.ToolExecutionResult {
	return harness.ToolExecutionResult{Code: code, Error: "Native operation was denied by the local session policy"}
}

func nativeData(value any) harness.ToolExecutionResult {
	data, err := json.Marshal(value)
	if err != nil {
		return nativeFailure("LOCAL_RESPONSE_INVALID")
	}
	return harness.ToolExecutionResult{Ok: true, Data: data}
}

// Desktop mode has its own exhaustive allowlist. Never fall through to the
// standalone dispatcher, even with a valid launch credential and forged inputs.
func nativeDispatch(w http.ResponseWriter, ctx context.Context, req nativeFrame, session *SessionContext) {
	var result harness.ToolExecutionResult
	switch req.Action {
	case "status", "native_protocol", "native_session_status":
		var empty struct{}
		if nativeprotocol.Decode(req.Inputs, &empty) != nil {
			sendErrorResponse(w, req.ID, -32602, "Invalid native control inputs")
			return
		}
		if req.Action == "native_protocol" {
			result = nativeData(session.Native.Negotiate())
		} else if req.Action == "status" && !session.Native.IsBound() && req.Authority == nil {
			result = nativeData(map[string]any{"status": "ok", "recent_events": []any{}, "event_count": 0})
		} else if code := session.Native.Check(req.Authority); code != "" {
			result = nativeFailure(code)
		} else if req.Action == "native_session_status" {
			result = nativeData(nativeprotocol.Binding{ProtocolVersion: nativeprotocol.Version, Authority: *req.Authority})
		} else {
			// No global telemetry backlog crosses a native workspace boundary.
			result = nativeData(map[string]any{"status": "ok", "recent_events": []any{}, "event_count": 0})
		}
	case "bind_native_session":
		var binding nativeprotocol.Binding
		if req.Authority != nil || nativeprotocol.Decode(req.Inputs, &binding) != nil {
			sendErrorResponse(w, req.ID, -32602, "Invalid native binding")
			return
		}
		if code := session.Native.Bind(binding); code != "" {
			result = nativeFailure(code)
		} else {
			result = nativeData(binding)
		}
	case "native_update_grants":
		var snapshot nativeprotocol.GrantSnapshot
		if nativeprotocol.Decode(req.Inputs, &snapshot) != nil {
			result = nativeFailure(session.Native.RejectGrantUpdate(req.Authority))
		} else if ack, code := session.Native.UpdateGrants(req.Authority, snapshot); code != "" {
			result = nativeFailure(code)
		} else {
			result = nativeData(ack)
		}
	case "native_read_text", "native_list", "native_stat":
		var inputs nativeprotocol.ReadRequest
		if nativeprotocol.Decode(req.Inputs, &inputs) != nil {
			sendErrorResponse(w, req.ID, -32602, "Invalid native read inputs")
			return
		}
		if data, code := session.Native.Read(ctx, req.Authority, req.Action, inputs); code != "" {
			result = nativeFailure(code)
		} else {
			result = nativeData(data)
		}
	default:
		code := session.Native.Check(req.Authority)
		if code == "" {
			code = "LOCAL_NATIVE_ACTION_DENIED"
		}
		result = nativeFailure(code)
	}
	writeResponse(w, JSONRPCResponse{ID: req.ID, Version: "2.0", Result: &result})
}
