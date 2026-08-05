// lib/ucol/runtime/portability.ts
// Phase 5 scaffold: protocol-surface portability to avoid Vercel/Cloudflare/Docker lock-in.

export type RuntimeEnvironment = 'node' | 'edge' | 'worker' | 'browser';

export interface PlatformCapabilities {
  supportsSubprocess: boolean;
  supportsFilesystem: boolean;
  supportsEnvAccess: boolean;
  supportsHeaders: boolean;
  supportsBodyStream: boolean;
  maxResponseSize: number;
}

export interface PlatformAdapter {
  readonly environment: RuntimeEnvironment;
  readonly capabilities: PlatformCapabilities;
  isSupported(): boolean;
  getFeatureFlag(feature: string): boolean;
}

const NODE_CAPABILITIES: PlatformCapabilities = {
  supportsSubprocess: true,
  supportsFilesystem: true,
  supportsEnvAccess: true,
  supportsHeaders: true,
  supportsBodyStream: true,
  maxResponseSize: 10 * 1024 * 1024,
};

const EDGE_CAPABILITIES: PlatformCapabilities = {
  supportsSubprocess: false,
  supportsFilesystem: false,
  supportsEnvAccess: false,
  supportsHeaders: true,
  supportsBodyStream: true,
  maxResponseSize: 1 * 1024 * 1024,
};

const WORKER_CAPABILITIES: PlatformCapabilities = {
  supportsSubprocess: false,
  supportsFilesystem: false,
  supportsEnvAccess: true,
  supportsHeaders: true,
  supportsBodyStream: true,
  maxResponseSize: 2 * 1024 * 1024,
};

const BROWSER_CAPABILITIES: PlatformCapabilities = {
  supportsSubprocess: false,
  supportsFilesystem: false,
  supportsEnvAccess: false,
  supportsHeaders: false,
  supportsBodyStream: true,
  maxResponseSize: 512 * 1024,
};

class NodeRuntimeAdapter implements PlatformAdapter {
  readonly environment: RuntimeEnvironment = 'node';
  readonly capabilities = NODE_CAPABILITIES;

  isSupported(): boolean {
    return typeof process !== 'undefined' && !!process.versions?.node;
  }

  getFeatureFlag(feature: string): boolean {
    const supportedFeatures = new Set([
      'subprocess',
      'filesystem',
      'env',
      'headers',
      'streaming',
      'large-responses',
    ]);
    return supportedFeatures.has(feature.toLowerCase());
  }
}

class EdgeRuntimeAdapter implements PlatformAdapter {
  readonly environment: RuntimeEnvironment = 'edge';
  readonly capabilities = EDGE_CAPABILITIES;

  isSupported(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as any).Request !== 'undefined' &&
      typeof (globalThis as any).Response !== 'undefined'
    );
  }

  getFeatureFlag(feature: string): boolean {
    const supportedFeatures = new Set([
      'headers',
      'streaming',
      'cookies',
      'edge-cache',
    ]);
    return supportedFeatures.has(feature.toLowerCase());
  }
}

class WorkerRuntimeAdapter implements PlatformAdapter {
  readonly environment: RuntimeEnvironment = 'worker';
  readonly capabilities = WORKER_CAPABILITIES;

  isSupported(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as any).fetch === 'function' &&
      typeof (globalThis as any).caches !== 'undefined'
    );
  }

  getFeatureFlag(feature: string): boolean {
    const supportedFeatures = new Set([
      'headers',
      'streaming',
      'caches',
      'durable-objects',
      'env',
    ]);
    return supportedFeatures.has(feature.toLowerCase());
  }
}

class BrowserRuntimeAdapter implements PlatformAdapter {
  readonly environment: RuntimeEnvironment = 'browser';
  readonly capabilities = BROWSER_CAPABILITIES;

  isSupported(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as any).window !== 'undefined'
    );
  }

  getFeatureFlag(feature: string): boolean {
    const supportedFeatures = new Set([
      'streaming',
      'fetch',
      'local-storage',
      'indexed-db',
    ]);
    return supportedFeatures.has(feature.toLowerCase());
  }
}

function detectRuntimeEnvironment(): RuntimeEnvironment {
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }

  if (typeof globalThis !== 'undefined') {
    const g = globalThis as any;
    if (g.window !== undefined) {
      return 'browser';
    }
    if (typeof g.Request === 'function' && typeof g.Response === 'function') {
      return 'edge';
    }
    if (typeof g.fetch === 'function' && g.caches !== undefined) {
      return 'worker';
    }
  }

  return 'node';
}

const adapterCache = new Map<RuntimeEnvironment, PlatformAdapter>();

function createAdapter(env: RuntimeEnvironment): PlatformAdapter {
  switch (env) {
    case 'node':
      return new NodeRuntimeAdapter();
    case 'edge':
      return new EdgeRuntimeAdapter();
    case 'worker':
      return new WorkerRuntimeAdapter();
    case 'browser':
      return new BrowserRuntimeAdapter();
    default:
      return new NodeRuntimeAdapter();
  }
}

let cachedEnvironment: RuntimeEnvironment | null = null;

export function getRuntimeEnvironment(): RuntimeEnvironment {
  if (cachedEnvironment) {
    return cachedEnvironment;
  }

  cachedEnvironment = detectRuntimeEnvironment();
  return cachedEnvironment;
}

export function getPlatformAdapter(env?: RuntimeEnvironment): PlatformAdapter {
  const environment = env ?? getRuntimeEnvironment();

  if (adapterCache.has(environment)) {
    return adapterCache.get(environment)!;
  }

  const adapter = createAdapter(environment);
  adapterCache.set(environment, adapter);
  return adapter;
}

export function resetPlatformCache(): void {
  cachedEnvironment = null;
  adapterCache.clear();
}

export function isSubprocessSupported(): boolean {
  return getPlatformAdapter().capabilities.supportsSubprocess;
}

export function isFilesystemSupported(): boolean {
  return getPlatformAdapter().capabilities.supportsFilesystem;
}

export function getMaxResponseSize(): number {
  return getPlatformAdapter().capabilities.maxResponseSize;
}
