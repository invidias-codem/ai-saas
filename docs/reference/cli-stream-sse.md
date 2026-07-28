# /api/cli/stream — SSE Reference

This document is the source of truth for raw `/api/cli/stream` wire format. It is written for terminal-native consumers and debug tooling that read SSE directly instead of going through browser middleware.

## Base contract

- Path: `/api/cli/stream`
- Method: `POST`
- Auth: bearer token when `LATTICE_CLI_TOKEN` is configured
- Runtime: Node.js
- Request `Content-Type`: `application/json`
- Response `Content-Type`: `text/event-stream`
- Cache-Control: `no-cache`
- Connection: `keep-alive`

## Request shape

```json
{
  "messages": [
    {
      "role": "user",
      "text": "string"
    }
  ],
  "options": {
    "localMode": false,
    "memoryPlan": null,
    "sudoPromptNames": []
  }
}
```

Fields:
- `messages`: array; at least one message required
- `messages[].role`: `user` | `assistant` | `system` | `model` | `bot`
- `messages[].text`: message text
- `options.localMode`: optional boolean for local sandbox intersection
- `options.memoryPlan`: optional memory routing plan
- `options.sudoPromptNames`: optional SudoLang prompt names to inject into the system instruction

## Headers

Required:
- `Content-Type: application/json`
- `x-lattice-user-id: string`

Conditionally required:
- `Authorization: Bearer <LATTICE_CLI_TOKEN>`

## Frame format

Every logical event is encoded using standard SSE framing:

```
event: <event-name>
data: <payload>

```

Trailing whitespace is permitted. `\r\n` and `\n` are both treated as line breaks by HTTP clients.

## Event taxonomy

### `event: message`

Default transport frame for emitted text. A single logical assistant chunk may arrive here.

Example:

```
event: message
data: partial assistant text
```

### `event: content_block_delta`

Signals a provider content-block delta. Use this event to preserve typed progress in UI or CLI state machines.

Example:

```
event: content_block_delta
data: {"type":"text_delta","text":"chunk"}
```

Notes:
- `type` indicates delta kind
- `text` is present for text deltas

### `event: content_block_stop`

Signals the end of a content block. When tool-call JSON is being reassembled across multiple deltas, parse the buffered JSON only after this event.

Example:

```
event: content_block_stop
data: {"type":"text"}
```

Notes:
- The trailing `type` identifies which content block stopped

### `event: message_stop`

Signals completion of the full assistant message. This is the safest boundary to:
- finalize buffered tool-call JSON
- commit local context state
- close recursion on shell tool execution loops

Example:

```
event: message_stop
data: {"type":"message_stop"}
```

Notes:
- Do not parse partial tool-call JSON before this event unless a dedicated tool structure is present

### `event: local_result`

Emitted by the terminal-side shim for local sandbox execution results. The wire-level payload is JSON stringified into the SSE `data:` field. Clients must parse it if `event:` is `local_result`.

Example:

```
event: message
data: {"execution":{"local":true,"command":"ls -la","cwd":"/Users/jjem/Projects/ai-saas"}}
```

Shim synthetic CLI frame:

```
event: local_result
data: {"command":"ls -la","mode":"local","status":"exit:0","stdout":"...","stderr":""}
```

### `event: done`

Signals normal stream termination.

Example:

```
event: done
data: {"done":true}
```

### `event: error`

Signals a non-fatal stream-level error. The stream may continue after this event.

Example:

```
event: error
data: {"error":"stream error"}
```

## JSON control envelopes

### Completion control

```json
{"done":true}
```

### Error control

```json
{"error":"string"}
```

### Local execution control

```json
{"execution":{"local":true,"command":"string","cwd":"string"}}
```

Fields:
- `execution.local`: boolean; indicates local shell execution intent
- `execution.command`: exact command to run
- `execution.cwd`: optional working directory

### Typed content delta

```json
{"type":"text_delta","text":"string"}
```

Fields:
- `type`: content delta type, typically `text_delta`
- `text`: incremental text

### Typed block stop

```json
{"type":"text"}
```

Fields:
- `type`: block type that stopped, e.g., `text`

## Client parsing rules

These rules are the concrete contract implemented by `bin/lattice-node` and should be matched by any raw SSE consumer.

1. Read raw SSDATA lines and buffer incomplete trailing fragments across chunk boundaries.
2. Skip empty lines.
3. For lines starting with `event:`, record the current event name for the next `data:` frame.
4. For lines starting with `data:`, trim the first five characters and inspect the payload.
5. If the trimmed payload starts with `{`, parse JSON.
6. If `parsed.execution?.local` is truthy, treat it as a local shell execution request.
7. Else if `parsed.done` is truthy, stop reading and finalize state.
8. Else if `parsed.error` is truthy, print the error and continue or abort based on client policy.
9. Else fall through to raw output and write text to the terminal.

### Timeout fallback

Implement a per-chunk read timeout in addition to terminal completion rules. In production, SSE connections can occasionally stall mid-stream where bytes stop flowing, but the server never emits `message_stop` or `error`.

Recommended behavior:
- Default timeout: `120` seconds without a new chunk
- On timeout, abort the reader, finalize state as if `done` was received, and surface a stream timeout error to the user instead of waiting indefinitely

## Tool-call streaming guidance

Tool use is one of the most likely causes of hangs and incomplete parse behavior in terminal agents. Use these rules to avoid them.

### General rules

- `tool_use` is treated as a content block type, identical to `text` for framing purposes.
- Tool-call args may arrive as multiple `content_block_delta` frames.
- Do not call `JSON.parse` on partial tool JSON. Reassemble the full args string first.
- Only execute parsing and subsequent tool execution after a terminal stop signal for the block.

### Safe tool-use parsing flow

1. On `event: content_block_delta` with `type === "tool_use"`, append `text` or `args` to a buffer keyed by `id`.
2. On `event: content_block_stop` for that block, run `JSON.parse(bufferedArgs)`.
3. On `event: message_stop`, commit the parsed tool call to execution state.
4. Execute tool calls sequentially in the order they appeared in the message unless your architecture explicitly enables parallelism.
5. Send structured tool results back through the same SSE envelope or return to the stream handler with an exact result contract.

### Common pitfalls

- Parsing partial JSON: tool args are often fragmented. Early parse results in malformed input and ignored calls.
- Missing stop events: if you only read `data:` lines, you can miss `event:*` headers on buffered chunk boundaries. Always buffer by newline and inspect both event and data together.
- Blocking on ambiguous completion: depend on `event: done` or `event: message_stop`, not reader closure alone.

## Local approval matrix behavior

When a local execution control envelope is received, the client evaluates the command against local trust settings before execution.

Decision outcomes:
- `auto`: approved command or `approval_mode=auto`
- `prompt`: interactive TTY confirmation required
- `deny`: blocked by matrix

`local_result` rejection example:

```
event: local_result
data: {"command":"rm -rf /","mode":"local","status":"rejected","stdout":"","stderr":"Command blocked by local approval matrix"}
```

`local_result` success example:

```
event: local_result
data: {"command":"pwd","mode":"local","status":"exit:0","stdout":"/Users/jjem/Projects/ai-saas\n","stderr":""}
```

## Authorization behavior

- Missing bearer token: `401 Unauthorized`
- Missing `x-lattice-user-id`: `401 Unauthorized`
- Malformed JSON body: `400 Validation Error`

In local development, set `LATTICE_CLI_TOKEN` to match on client and server, or leave it unset on both. Mismatched values always return 401.

## Transport notes

- Streams are not rewindable
- Clients must preserve line buffer boundaries across chunk boundaries
- `\n` is the frame delimiter
- No binary frames are used

EOF
sed -n '1,260p' docs/reference/cli-stream-sse.md