/**
 * Unified provider abstraction for UCOL code generation.
 *
 * Each provider exposes a single `generateCode()` method so the router
 * never needs to know which backend is being used.
 */

import type { GeneratedFile } from '@/lib/ucol/types';
import type { ContextPackage, RefinementContext, DiscoveredPattern } from '@/lib/ucol/types';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';

export interface ProviderCallContext {
  providerKeys: ProviderApiKeys;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CodeProvider {
  id: string;
  label: string;
  tier: 'L1' | 'L2' | 'L3';
  generateCode(context: ContextPackage, refinement?: RefinementContext, discoveredPatterns?: DiscoveredPattern[], call?: ProviderCallContext): Promise<GeneratedFile[]>;
}
