// __tests__/contracts/acquisition-apify-registry.contract.test.ts
// A2 registry contracts:
//   - selection deterministic (priority desc → key lexical; order-proof)
//   - disabled/mismatched actors never selected
//   - resource mode works; discovery unsupported until A7
//   - actor input sees canonicalUrl, NEVER originalUrl
//   - production registry ships EMPTY (A2 ≠ A2+A4)

import {
  ACTOR_REGISTRY,
  selectActor,
  type ApifyActorDefinition,
  type ApifyActorInputContext,
} from '@/lib/acquisition/providers/apify/actorRegistry';

function actor(key: string, over: Partial<ApifyActorDefinition> = {}): ApifyActorDefinition {
  return {
    key,
    actorId: `apify/${key}`,
    build: '1.0.0',
    enabled: true,
    modes: ['resource'],
    platforms: ['threads'],
    resourceTypes: ['post', 'profile'],
    priority: 10,
    mapInput: (i: ApifyActorInputContext) => ({ url: i.canonicalUrl, maxItems: i.maxRecords }),
    ...over,
  };
}

describe('apify actor registry — A2 contracts', () => {
  it('1: selects the highest-priority eligible actor; ties break on key', () => {
    const reg = [actor('low', { priority: 1 }), actor('high', { priority: 50 }), actor('mid', { priority: 10 })];
    expect(selectActor({ registry: reg, platform: 'threads', resourceType: 'post', mode: 'resource' })?.key).toBe('high');
    // tie → lexical
    const tie = [actor('bbb', { priority: 5 }), actor('aaa', { priority: 5 })];
    expect(selectActor({ registry: tie, platform: 'threads', resourceType: 'post', mode: 'resource' })?.key).toBe('aaa');
  });

  it('2: selection is registration-order-proof', () => {
    const a = [actor('x1', { priority: 5 }), actor('x2', { priority: 5, platforms: ['reddit'] })];
    const b = [actor('x2', { priority: 5, platforms: ['reddit'] }), actor('x1', { priority: 5 })];
    const pick = (reg: ApifyActorDefinition[]) =>
      selectActor({ registry: reg, platform: 'threads', resourceType: 'post', mode: 'resource' })?.key;
    expect(pick(a)).toBe(pick(b));
    expect(pick(a)).toBe('x1');
  });

  it('3: disabled and capability-mismatched actors are never selected', () => {
    const reg = [
      actor('off', { enabled: false, priority: 999 }),
      actor('wrong-platform', { platforms: ['instagram'], priority: 99 }),
      actor('wrong-type', { resourceTypes: ['profile'], priority: 98 }),
      actor('ok', { priority: 1 }),
    ];
    expect(selectActor({ registry: reg, platform: 'threads', resourceType: 'post', mode: 'resource' })?.key).toBe('ok');
    // nothing matches at all
    expect(selectActor({ registry: reg, platform: 'bluesky', resourceType: 'post', mode: 'resource' })).toBeNull();
  });

  it('4: discovery mode is unsupported until A7', () => {
    const reg = [actor('threads-post')];
    expect(selectActor({ registry: reg, platform: 'threads', resourceType: 'post', mode: 'discovery' })).toBeNull();
  });

  it('5: actor input context exposes canonicalUrl only — originalUrl is structurally absent', () => {
    // Compile-time guarantee: the interface has no originalUrl field.
    const ctx: ApifyActorInputContext = {
      platform: 'threads',
      resourceType: 'post',
      canonicalUrl: 'https://threads.com/@a/post/ABC',
      externalId: 'ABC',
      handle: 'a',
      objective: 'research',
      maxRecords: 25,
    };
    expect(Object.keys(ctx).sort()).toEqual(
      ['canonicalUrl', 'externalId', 'handle', 'maxRecords', 'objective', 'platform', 'resourceType'].sort(),
    );
    expect('originalUrl' in ctx).toBe(false);
  });

  it('6: the production registry ships EMPTY — A2 does not sneak in A4', () => {
    expect(ACTOR_REGISTRY).toHaveLength(0);
  });
});
