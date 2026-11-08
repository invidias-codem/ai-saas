/** Keep NVIDIA's retired Kimi K3 endpoint out of production code/agentic routing. */
import { NIM_MODEL_CODE } from '@/lib/llm/providers/nvidiaNim';
import { CODE_MODELS } from '@/lib/llm/codeModels';
import { MODEL_CATALOG } from '@/lib/ucol/modelRouter';
import { nimChat } from '@/lib/ucol/prompts/nimChat';

jest.mock('@/lib/env', () => ({
  nvidiaNimConfig: jest.fn(() => ({
    apiKey: 'test-nvidia-key',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
  })),
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('NVIDIA NIM code model EOL remediation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses a single supported code target across model catalog and agentic UI', () => {
    expect(NIM_MODEL_CODE).toBe('nvidia/nemotron-3-ultra-550b-a55b');
    expect(MODEL_CATALOG[0].modelId).toBe(NIM_MODEL_CODE);
    expect(CODE_MODELS.agentic.modelId).toBe(NIM_MODEL_CODE);
  });

  it('does not send Kimi-specific reasoning_effort to Nemotron during Code Builder JSON calls', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await nimChat('Plan a component', 'Build a component', {
      reasoningEffort: 'high',
      timeoutMs: 10_000,
    });
    expect(result.model).toBe(NIM_MODEL_CODE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    const payload = JSON.parse(String(init?.body));
    expect(payload.model).toBe(NIM_MODEL_CODE);
    expect(payload.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(payload).not.toHaveProperty('reasoning_effort');
  });
});
