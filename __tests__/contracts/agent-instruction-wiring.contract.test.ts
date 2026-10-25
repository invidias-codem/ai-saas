/**
 * Phase 0 (#440 review finding 1 + 5) — provider-input wiring contracts.
 *
 * The manifest-derived Weaver instruction must reach the ACTUAL provider
 * input on every inference surface:
 *   - NIM: provider.chatWithTools options.systemInstruction
 *   - Gemini: model.startChat(StartChatParams).systemInstruction
 * and the capability trace must carry request correlation identifiers.
 */
const chatWithToolsMock = jest.fn().mockResolvedValue({ content: 'final answer', toolCalls: [] });

jest.mock('@/lib/llm/providers/nvidiaNim', () => ({
  NvidiaNimProvider: class {
    chatWithTools = chatWithToolsMock;
  },
  NIM_MODEL_KIMI_K3: 'kimi-k3-mock',
}));

let startChatOptions: Record<string, unknown> | undefined;
jest.mock('@google-cloud/vertexai', () => ({
  VertexAI: class {
    getGenerativeModel = () => ({
      startChat: (opts: Record<string, unknown>) => {
        startChatOptions = opts;
        return {
          sendMessage: jest.fn().mockResolvedValue({
            response: Promise.resolve({
              candidates: [{ content: { parts: [{ text: 'final answer' }] } }],
            }),
          }),
        };
      },
    });
  },
}));

jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/cli/promotionPrompt', () => ({
  withPromotionGate: jest.fn(),
  NeedsApprovalError: class extends Error {},
}));
jest.mock('@/lib/execution/sandboxManager', () => ({ sandboxManager: {} }));
jest.mock('@/lib/ucol/contextFirewall', () => ({ interceptTool: () => ({ decision: 'allow' }) }));
jest.mock('@/lib/telemetry', () => ({ logEvent: jest.fn() }));

import { runNimReactLoop } from '@/lib/agents/core/nimReactLoop';
import { runReActLoop } from '@/lib/agents/core/reactLoop';
import { ToolRegistry } from '@/lib/agents/core/registry';
import {
  buildCapabilityManifest,
  buildWeaverSystemInstruction,
  logCapabilityResolution,
} from '@/lib/agents/core/capabilityManifest';
import { logEvent } from '@/lib/telemetry';

const ctx = {
  userId: 'u1',
  sessionId: 's1',
  workspaceId: 'ws_1',
  history: [],
  enableTelemetry: false,
} as any;

const manifest = buildCapabilityManifest({
  resolvedMode: 'agentic',
  workspaceId: 'ws_1',
  surface: 'web',
  memoryReadEnabled: true,
  webResearchEnabled: true,
  ioHarnessPresent: true,
});
const instruction = buildWeaverSystemInstruction(manifest);
const emptyRegistry = new ToolRegistry();

describe('instruction reaches the actual provider input — NIM path (#440)', () => {
  beforeEach(() => chatWithToolsMock.mockClear());

  it('chatWithTools receives the manifest-derived system instruction', async () => {
    await runNimReactLoop('q', ctx, emptyRegistry, 'kimi-k3-mock', instruction);
    const options = chatWithToolsMock.mock.calls[0][1] as Record<string, unknown>;
    expect(options.systemInstruction).toBe(instruction);
    expect(String(options.systemInstruction)).toContain('You are Weaver');
  });

  it('an absent instruction stays absent at the provider boundary', async () => {
    await runNimReactLoop('q', ctx, emptyRegistry, 'kimi-k3-mock');
    const options = chatWithToolsMock.mock.calls[0][1] as Record<string, unknown>;
    expect(options.systemInstruction).toBeUndefined();
  });
});

describe('instruction reaches the actual provider input — Gemini path (#440)', () => {
  beforeEach(() => {
    startChatOptions = undefined;
    process.env.MODEL_PROVIDER = 'vertex';
  });
  afterEach(() => {
    delete process.env.MODEL_PROVIDER;
  });

  it('startChat receives the manifest-derived systemInstruction', async () => {
    await runReActLoop('q', ctx, emptyRegistry, 'gemini-2.5-flash', instruction);
    expect(startChatOptions?.systemInstruction).toBe(instruction);
    expect(String(startChatOptions?.systemInstruction)).toContain('You are Weaver');
  });

  it('an absent instruction is not injected into startChat', async () => {
    await runReActLoop('q', ctx, emptyRegistry, 'gemini-2.5-flash');
    expect(startChatOptions?.systemInstruction).toBeUndefined();
  });
});

describe('capability trace carries request correlation (#440 finding 5)', () => {
  it('logEvent metadata includes requestId and conversationId', async () => {
    (logEvent as jest.Mock).mockClear();
    await logCapabilityResolution({
      userId: 'u1',
      workspaceId: 'ws_1',
      requestId: 'req-9',
      conversationId: 'conv-9',
      manifest,
      toolNames: ['web_search'],
    });
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'capability_manifest_resolved',
        metadata: expect.objectContaining({
          requestId: 'req-9',
          conversationId: 'conv-9',
          surface: 'web',
          resolvedMode: 'agentic',
          toolNames: ['web_search'],
        }),
      }),
    );
  });
});
