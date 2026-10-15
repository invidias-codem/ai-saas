// Official SDK boundary. Credentials are read only when an operation executes;
// importing the Trigger task during a build performs no network or paid work.
import { ApifyClient, type ActorRun, type ActorRunPricingInfo } from 'apify-client';
import { env } from '@/lib/env';
import type { ApifyBoundary, ApifyRunView } from './provider';
import type { ActorPricingInfo } from './pricing';

function client(): ApifyClient {
  const token = env.APIFY_API_TOKEN;
  if (!token) throw new Error('Apify operation refused: APIFY_API_TOKEN not configured');
  // Retrying an ambiguous start response could create another paid run.
  return new ApifyClient({ token, maxRetries: 0, timeoutSecs: 30 });
}

function notFound(kind: string): Error & { statusCode: number } {
  return Object.assign(new Error(`Apify ${kind} not found`), { statusCode: 404 });
}

function projectRun(run: ActorRun): ApifyRunView {
  return {
    id: run.id,
    actId: run.actId,
    status: run.status,
    defaultDatasetId: run.defaultDatasetId,
    options: { ...run.options },
    usageTotalUsd: run.usageTotalUsd,
  };
}

function currentPricing(infos: ActorRunPricingInfo[] | undefined): ActorPricingInfo {
  if (!infos?.length) throw new Error('Apify pricing unavailable');
  const dated = infos.map(info => ({ info, at: new Date(info.startedAt).getTime() }));
  if (dated.some(record => !Number.isFinite(record.at))) throw new Error('Apify pricing date invalid');
  const now = Date.now();
  const active = dated.filter(record => record.at <= now).sort((a, b) => b.at - a.at);
  const selected = active[0];
  if (!selected || active[1]?.at === selected.at) throw new Error('Apify current pricing unavailable or ambiguous');
  const info = selected.info;
  switch (info.pricingModel) {
    case 'FREE':
      return { pricingModel: 'FREE' };
    case 'PRICE_PER_DATASET_ITEM':
      if (!Number.isFinite(info.pricePerUnitUsd) || info.pricePerUnitUsd <= 0) throw new Error('Apify unit price invalid');
      return { pricingModel: info.pricingModel, pricePerUnitUsd: info.pricePerUnitUsd };
    case 'PAY_PER_EVENT': {
      const minimum = info.minimalMaxTotalChargeUsd;
      if (minimum !== undefined && (!Number.isFinite(minimum) || minimum < 0)) throw new Error('Apify minimum charge invalid');
      return { pricingModel: info.pricingModel, minimalMaxTotalChargeUsd: minimum };
    }
    default:
      throw new Error('Apify pricing model unsupported');
  }
}

function requireLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Apify record limit must be a positive safe integer');
}

export const productionApifyBoundary: ApifyBoundary = {
  async actorPricing(actorId) {
    const actor = await client().actor(actorId).get();
    if (!actor) throw notFound('actor');
    return currentPricing(actor.pricingInfos);
  },
  async startRun(actorId, build, input, runOptions) {
    requireLimit(runOptions.maxItems);
    if (!build.trim()) throw new Error('Apify build must be explicit');
    const cost = runOptions.maxTotalChargeUsd;
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) throw new Error('Apify spending cap invalid');
    const run = await client().actor(actorId).start(input, {
      build, ...runOptions, waitForFinish: 0, restartOnError: false,
    });
    return projectRun(run);
  },
  async getRun(runId) {
    const run = await client().run(runId).get();
    if (!run) throw notFound('run');
    return projectRun(run);
  },
  async listDatasetItems(datasetId, limit) {
    requireLimit(limit);
    const { items } = await client().dataset(datasetId).listItems({ limit, clean: false });
    return items.slice(0, limit);
  },
  async abortRun(runId) {
    await client().run(runId).abort();
  },
};
