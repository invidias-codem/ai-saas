import { Readable } from 'node:stream';

jest.mock('@clerk/nextjs/server', () => ({ currentUser: jest.fn().mockResolvedValue({ id: 'user_test' }) }));
jest.mock('@/lib/security/apiAuth', () => ({
  requireAuth: jest.fn().mockResolvedValue({ userId: 'user_test' }),
  handleAuthError: jest.fn(),
}));
jest.mock('@/lib/ucol/runtimeContextResolver', () => ({
  resolveRuntimeContext: jest.fn().mockResolvedValue({ ucolContext: { workspaceId: null } }),
}));
jest.mock('@/lib/ucol/routing/decision', () => ({ buildInitialRoutingDecision: jest.fn().mockReturnValue({}) }));
jest.mock('@/lib/supabaseClient', () => ({ supabase: null, supabaseAdmin: null }));
jest.mock('@/lib/userProviderKeys', () => ({
  getUserProviderApiKeys: jest.fn().mockResolvedValue({}),
  getEffectiveProviderKeys: jest.fn().mockResolvedValue({}),
}));
jest.mock('@/lib/native/providerSecretHydrator', () => ({ hydrateNativeProviderKeys: jest.fn().mockResolvedValue({}) }));
jest.mock('@/lib/budget/redisKillSwitch', () => ({ budgetKillSwitch: { checkBudget: jest.fn().mockResolvedValue({ allowed: true }) } }));
jest.mock('@/lib/context/preparedContext', () => ({
  createPreparedContextPlanFromMemoryPlan: jest.fn().mockReturnValue({ readScopes: [] }),
  prepareContextBundle: jest.fn().mockResolvedValue({
    userContext: {},
    raw: { allFacts: [], intelligentFacts: [], researchResults: [], userProfileMemories: [], memorySources: [] },
    routing: {},
    sections: {},
    metrics: { graphRelatedCount: 0, researchResultsCount: 0 },
  }),
}));
jest.mock('@/lib/observability/langfuse', () => ({ createTrace: jest.fn() }));
jest.mock('@/lib/telemetry/emit', () => ({ emitInteractionAudit: jest.fn() }));
jest.mock('@/lib/world-model/distribution-shift', () => ({
  createDistributionShiftDetector: () => ({ logQuery: jest.fn(), extractKeywords: () => [] }),
}));
jest.mock('@/lib/world-model/benchmarking', () => ({ createBenchmarkingPipeline: () => ({ benchmark: jest.fn() }) }));
jest.mock('@/lib/llm/providers/minimaxM1', () => ({ MiniMaxM1Provider: jest.fn() }));
jest.mock('@/lib/llm/routing/circuitBreaker', () => ({
  checkCircuit: jest.fn().mockResolvedValue(true),
  recordCircuitFailure: jest.fn(),
  recordCircuitSuccess: jest.fn(),
}));

const mockSendMessageStream = jest.fn();
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({ startChat: () => ({ sendMessageStream: mockSendMessageStream }) }),
  })),
}));

const mockGetObject = jest.fn();
jest.mock('@/lib/gcp/storage', () => ({
  getStorageProjectId: () => 'test-project',
  getStorageClient: () => ({ bucket: () => ({ file: mockGetObject }) }),
}));

import { MiniMaxM1Provider } from '@/lib/llm/providers/minimaxM1';
import { POST } from '@/app/api/analyze-upload/route';
import { resolveConversationAttachment } from '@/lib/llm/conversationAttachment';
import { compressBase64Payload } from '@/lib/uploadCompression';
import type { FileUploadPayload } from '@/lib/uploadCompression';

const testImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=', 'base64');
const photo = { name: 'screenshot.png', type: 'image/png', mimeType: 'image/png' };

function analyze(fileData: FileUploadPayload) {
  return POST(new Request('https://lattice.test/api/analyze-upload', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', text: 'What’s in this picture?' }], fileData }),
  }));
}

describe('photo upload to Gemini', () => {
  const previousGoogleKey = process.env.GOOGLE_API_KEY;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_API_KEY = 'test';
    mockSendMessageStream.mockResolvedValue({
      stream: (async function* () { yield { text: () => 'Image received.' }; })(),
    });
  });
  afterEach(() => {
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = previousGoogleKey;
  });

  test('sends actual image bytes to Gemini when the MIME type is nested in the mobile payload', async () => {
    const data = testImage.toString('base64');
    const response = await analyze({ ...photo, base64Data: data });
    if (!response.ok) throw new Error(await response.text());
    expect(await response.text()).toContain('Image received.');
    expect(mockSendMessageStream).toHaveBeenCalledWith(
      expect.arrayContaining([{ inlineData: { mimeType: 'image/png', data } }]),
      expect.anything(),
    );
  });

  test('keeps compressed payloads from older clients compatible', async () => {
    const data = Buffer.alloc(60_000, 11).toString('base64');
    const file = compressBase64Payload({ ...photo, base64Data: data });
    expect(file.__compressed).toBe(true);
    const response = await analyze(file);
    if (!response.ok) throw new Error(await response.text());
    await response.text();
    expect(mockSendMessageStream.mock.calls[0][0]).toContainEqual({ inlineData: { mimeType: 'image/png', data } });
  });

  test('reads a signed upload in the current user’s namespace before building the image part', async () => {
    mockGetObject.mockReturnValue({ createReadStream: () => Readable.from([testImage]) });
    const response = await analyze({ ...photo, fileUri: 'gs://genie-uploads-test-project/user_test/upload-1/screenshot.png' });
    if (!response.ok) throw new Error(await response.text());
    await response.text();
    expect(mockGetObject).toHaveBeenCalledWith('user_test/upload-1/screenshot.png');
    expect(mockSendMessageStream.mock.calls[0][0]).toContainEqual({
      inlineData: { mimeType: 'image/png', data: testImage.toString('base64') },
    });
  });

  test.each([
    'gs://genie-uploads-test-project/user_other/upload-1/screenshot.png',
    'gs://genie-uploads-test-project/user_test/upload-1/..',
    'gs://another-bucket/user_test/upload-1/screenshot.png',
  ])('rejects an out-of-scope upload reference', async fileUri => {
    const response = await analyze({ ...photo, fileUri });
    expect(response.status).toBe(400);
    expect(mockGetObject).not.toHaveBeenCalled();
    expect(mockSendMessageStream).not.toHaveBeenCalled();
  });

  test('does not fall back to a text-only model when an uploaded image cannot be read', async () => {
    const oldRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test';
    mockGetObject.mockReturnValue({ createReadStream: () => Readable.from([]) });
    const fallback = jest.fn();
    (MiniMaxM1Provider as jest.Mock).mockImplementation(() => ({ generateStream: fallback }));
    try {
      const response = await analyze({ ...photo, fileUri: 'gs://genie-uploads-test-project/user_test/upload-1/screenshot.png' });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ message: expect.stringContaining('Try sending it again') });
      expect(mockSendMessageStream).not.toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      if (oldRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = oldRouterKey;
    }
  });

  test('does not call the model with only the filename when image bytes are missing', async () => {
    const response = await analyze(photo);
    expect(response.status).toBe(400);
    expect(mockSendMessageStream).not.toHaveBeenCalled();
  });

  test('retains support for the legacy base64 field', () => {
    const data = testImage.toString('base64');
    expect(resolveConversationAttachment({ fileName: photo.name, mimeType: photo.mimeType, fileData: data }, 'user_test'))
      .toEqual({ name: photo.name, mimeType: photo.mimeType, base64Data: data });
  });

  const analyzeImages = (fileDataList: FileUploadPayload[], extra: Record<string, unknown> = {}) =>
    POST(new Request('https://lattice.test/api/analyze-upload', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', text: 'Compare these photos.' }],
        fileDataList, ...extra,
      }),
    }));

  test('delivers both images to Gemini in order rather than only the first', async () => {
    const first = testImage.toString('base64');
    const second = Buffer.from('second-image-pixels').toString('base64');
    const response = await analyzeImages([
      { ...photo, sizeBytes: testImage.length, base64Data: first },
      { ...photo, name: 'second.png', sizeBytes: 19, base64Data: second },
    ]);
    if (!response.ok) throw new Error(await response.text());
    await response.text();
    const parts = mockSendMessageStream.mock.calls[0][0];
    expect(parts.filter((part: { inlineData?: unknown }) => part.inlineData)).toEqual([
      { inlineData: { mimeType: 'image/png', data: first } },
      { inlineData: { mimeType: 'image/png', data: second } },
    ]);
  });

  test('retrieves additional signed photos only from the authenticated user namespace', async () => {
    mockGetObject.mockReturnValue({ createReadStream: () => Readable.from([testImage]) });
    const first = testImage.toString('base64');
    const response = await analyzeImages([
      { ...photo, sizeBytes: testImage.length, base64Data: first },
      { ...photo, name: 'other.png', sizeBytes: testImage.length,
        fileUri: 'gs://genie-uploads-test-project/user_test/upload-2/other.png' },
    ]);
    if (!response.ok) throw new Error(await response.text());
    await response.text();
    expect(mockGetObject).toHaveBeenCalledWith('user_test/upload-2/other.png');
    expect(mockSendMessageStream.mock.calls[0][0].filter((part: { inlineData?: unknown }) => part.inlineData)).toHaveLength(2);
  });

  test('rejects a foreign signed image when it is one of several photos', async () => {
    const response = await analyzeImages([
      { ...photo, sizeBytes: testImage.length, base64Data: testImage.toString('base64') },
      { ...photo, sizeBytes: testImage.length, fileUri: 'gs://genie-uploads-test-project/user_other/upload-2/other.png' },
    ]);
    expect(response.status).toBe(400);
    expect(mockSendMessageStream).not.toHaveBeenCalled();
  });

  test('rejects more than ten images before invoking the provider', async () => {
    const response = await analyzeImages(Array.from({ length: 11 }, (_, index) => ({
      ...photo, name: `img-${index}.png`, sizeBytes: testImage.length, base64Data: testImage.toString('base64'),
    })));
    expect(response.status).toBe(400);
    expect(mockSendMessageStream).not.toHaveBeenCalled();
  });

  test('rejects a PDF mixed with images in the image-only batch', async () => {
    const response = await analyzeImages([
      { ...photo, sizeBytes: testImage.length, base64Data: testImage.toString('base64') },
      { name: 'document.pdf', type: 'application/pdf', mimeType: 'application/pdf',
        sizeBytes: 16, base64Data: Buffer.from('pdf').toString('base64') },
    ]);
    expect(response.status).toBe(400);
    expect(mockSendMessageStream).not.toHaveBeenCalled();
  });

  test('rejects missing or oversized images and mixed single-plus-batch fields', async () => {
    const valid = { ...photo, sizeBytes: testImage.length, base64Data: testImage.toString('base64') };
    expect((await analyzeImages([valid, { ...photo, name: 'missing.png', sizeBytes: 10 }])).status).toBe(400);
    expect((await analyzeImages([valid, { ...valid, sizeBytes: 11 * 1024 * 1024 }])).status).toBe(413);
    expect((await analyzeImages([valid, valid], { fileData: valid })).status).toBe(400);
    expect(mockSendMessageStream).not.toHaveBeenCalled();
  });
});
