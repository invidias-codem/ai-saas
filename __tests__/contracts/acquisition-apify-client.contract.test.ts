import { ApifyClient } from 'apify-client';
import { productionApifyBoundary } from '@/lib/acquisition/providers/apify/client';
import { env } from '@/lib/env';
import { buildProductionProvider } from '@/src/trigger/acquisitionIngestTask';

jest.mock('apify-client', () => ({ ApifyClient: jest.fn() }));
jest.mock('@/lib/env', () => ({ env: { APIFY_API_TOKEN: 'test-token' } }));
jest.mock('@trigger.dev/sdk', () => ({ task: (config: unknown) => config }));
jest.mock('@/lib/acquisition/store/acquisitionStore', () => ({}));
jest.mock('@/lib/telemetry', () => ({ logEvent: jest.fn() }));

const actorGet = jest.fn();
const start = jest.fn();
const call = jest.fn();
const runGet = jest.fn();
const abort = jest.fn();
const listItems = jest.fn();
const actor = jest.fn(() => ({ get: actorGet, start, call }));
const run = jest.fn(() => ({ get: runGet, abort }));
const dataset = jest.fn(() => ({ listItems }));
const sdk = ApifyClient as jest.MockedClass<typeof ApifyClient>;
const pricing = (pricingModel: string, extra: Record<string, unknown> = {}) => ({
  pricingModel, startedAt: new Date('2026-01-01T00:00:00Z'), ...extra,
});
const view = { id: 'run-1', actId: 'actor-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-1', options: { maxItems: 2 }, usageTotalUsd: 0.03 };

describe('production Apify SDK boundary', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 15));
    (env as { APIFY_API_TOKEN?: string }).APIFY_API_TOKEN = 'test-token';
    sdk.mockImplementation(() => ({ actor, run, dataset }) as unknown as ApifyClient);
    actor.mockReturnValue({ get: actorGet, start, call });
    run.mockReturnValue({ get: runGet, abort });
    dataset.mockReturnValue({ listItems });
    actorGet.mockResolvedValue({ pricingInfos: [pricing('FREE')] });
    start.mockResolvedValue(view);
    runGet.mockResolvedValue(view);
    listItems.mockResolvedValue({ items: [{ id: 1 }, { id: 2 }] });
    abort.mockResolvedValue(view);
  });
  afterEach(() => jest.restoreAllMocks());

  test('the production Trigger task imports and constructs its provider without SDK calls', () => {
    expect(buildProductionProvider().id).toBe('apify');
    expect(sdk).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  test('missing credentials refuse before constructing the SDK', async () => {
    (env as { APIFY_API_TOKEN?: string }).APIFY_API_TOKEN = undefined;
    await expect(productionApifyBoundary.getRun('run-1')).rejects.toThrow('APIFY_API_TOKEN');
    expect(sdk).not.toHaveBeenCalled();
  });

  test('credentials are read at operation time and requests have bounded retries/timeouts', async () => {
    (env as { APIFY_API_TOKEN?: string }).APIFY_API_TOKEN = 'changed-test-token';
    await productionApifyBoundary.getRun('run-1');
    expect(sdk).toHaveBeenCalledWith({ token: 'changed-test-token', maxRetries: 0, timeoutSecs: 30 });
  });

  test('launches one asynchronous start with the exact build and spending caps', async () => {
    await productionApifyBoundary.startRun('actor-1', '1.2.3', { maxPosts: 2 }, { maxItems: 2, maxTotalChargeUsd: 0.05 });
    expect(actor).toHaveBeenCalledWith('actor-1');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({ maxPosts: 2 }, {
      build: '1.2.3', maxItems: 2, maxTotalChargeUsd: 0.05, waitForFinish: 0, restartOnError: false,
    });
    expect(call).not.toHaveBeenCalled();
  });

  test('ambiguous start failures propagate without an application retry', async () => {
    start.mockRejectedValue(new Error('response lost'));
    await expect(productionApifyBoundary.startRun('actor-1', '1.2.3', {}, { maxItems: 2 })).rejects.toThrow('response lost');
    expect(start).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
  });

  test.each([0, -1, 1.5, NaN, Infinity])('invalid record authority %s refuses before start', async maxItems => {
    await expect(productionApifyBoundary.startRun('actor-1', '1.2.3', {}, { maxItems })).rejects.toThrow();
    expect(start).not.toHaveBeenCalled();
  });

  test('empty build and nonfinite spending caps cannot launch', async () => {
    await expect(productionApifyBoundary.startRun('actor-1', '', {}, { maxItems: 1 })).rejects.toThrow();
    await expect(productionApifyBoundary.startRun('actor-1', '1.2.3', {}, { maxItems: 1, maxTotalChargeUsd: Infinity })).rejects.toThrow();
    expect(start).not.toHaveBeenCalled();
  });

  test('run projection retains recorded authority, final cost, and dataset identity', async () => {
    runGet.mockResolvedValue({ ...view, token: 'must-not-cross-boundary', input: 'private' });
    expect(await productionApifyBoundary.getRun('run-1')).toEqual(view);
    expect(run).toHaveBeenCalledWith('run-1');
  });

  test('unknown runs preserve provider-plane 404 semantics', async () => {
    runGet.mockResolvedValue(undefined);
    await expect(productionApifyBoundary.getRun('unknown')).rejects.toMatchObject({ statusCode: 404 });
  });

  test('dataset collection enforces the recorded limit even if the SDK over-returns', async () => {
    listItems.mockResolvedValue({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    expect(await productionApifyBoundary.listDatasetItems('ds-1', 2)).toEqual([{ id: 1 }, { id: 2 }]);
    expect(dataset).toHaveBeenCalledWith('ds-1');
    expect(listItems).toHaveBeenCalledWith({ limit: 2, clean: false });
    await expect(productionApifyBoundary.listDatasetItems('ds-1', Infinity)).rejects.toThrow();
    expect(listItems).toHaveBeenCalledTimes(1);
  });

  test('empty datasets are valid and cancellation targets only the existing run', async () => {
    listItems.mockResolvedValue({ items: [] });
    expect(await productionApifyBoundary.listDatasetItems('ds-1', 2)).toEqual([]);
    await productionApifyBoundary.abortRun('run-1');
    expect(run).toHaveBeenCalledWith('run-1');
    expect(abort).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  test.each([
    [pricing('FREE'), { pricingModel: 'FREE' }],
    [pricing('PRICE_PER_DATASET_ITEM', { pricePerUnitUsd: 0.01 }), { pricingModel: 'PRICE_PER_DATASET_ITEM', pricePerUnitUsd: 0.01 }],
    [pricing('PAY_PER_EVENT', { minimalMaxTotalChargeUsd: 0.05 }), { pricingModel: 'PAY_PER_EVENT', minimalMaxTotalChargeUsd: 0.05 }],
  ])('normalizes supported current pricing %#', async (record, expected) => {
    actorGet.mockResolvedValue({ pricingInfos: [record] });
    expect(await productionApifyBoundary.actorPricing('actor-1')).toEqual(expected);
  });

  test('chooses current pricing rather than the first historical or future price', async () => {
    actorGet.mockResolvedValue({ pricingInfos: [
      pricing('FREE', { startedAt: new Date('2025-01-01') }),
      pricing('PAY_PER_EVENT', { startedAt: new Date('2099-01-01'), minimalMaxTotalChargeUsd: 100 }),
      pricing('PRICE_PER_DATASET_ITEM', { startedAt: new Date('2026-06-01'), pricePerUnitUsd: 0.02 }),
    ] });
    expect(await productionApifyBoundary.actorPricing('actor-1')).toEqual({ pricingModel: 'PRICE_PER_DATASET_ITEM', pricePerUnitUsd: 0.02 });
  });

  test.each([
    undefined, [], [pricing('FLAT_PRICE_PER_MONTH')], [pricing('PRICE_PER_DATASET_ITEM', { pricePerUnitUsd: NaN })],
    [pricing('PAY_PER_EVENT', { minimalMaxTotalChargeUsd: -1 })],
    [pricing('FREE', { startedAt: new Date('invalid') })],
    [pricing('FREE'), pricing('PAY_PER_EVENT')],
  ].map(pricingInfos => ({ pricingInfos })))('missing, unsupported, malformed, or ambiguous pricing refuses %#', async ({ pricingInfos }) => {
    actorGet.mockResolvedValue({ pricingInfos });
    await expect(productionApifyBoundary.actorPricing('actor-1')).rejects.toThrow();
    expect(start).not.toHaveBeenCalled();
  });
});
