export type ComparisonMode = 'exact' | 'semantic' | 'normalized';

export interface FixtureManifestEntry {
  id: string;
  category: string;
  tier: number;
  operation: string;
  comparisonMode: ComparisonMode;
  path: string;
  sourceTests?: string[];
}

export interface FixtureManifest {
  version: number;
  suite: string;
  description?: string;
  fixtures: FixtureManifestEntry[];
}

export interface FixtureStep {
  operation: string;
  inputs: Record<string, unknown>;
}

export interface FixtureFile {
  id: string;
  title?: string;
  category: string;
  tier: number;
  operation: string;
  comparisonMode: ComparisonMode;
  sourceTests?: string[];
  inputs?: Record<string, unknown>;
  steps?: FixtureStep[];
  workspace?: {
    root?: string;
    seedFiles?: string[];
  };
  timing?: {
    maxWallClockMs?: number;
  };
}

export interface ExpectedResult {
  ok?: boolean;
  code?: string | null;
  output?: {
    equals?: string | null;
    contains?: string[];
    notContains?: string[];
    length?: {
      equals?: number;
      min?: number;
      max?: number;
    };
  };
  error?: {
    equals?: string | null;
    contains?: string[];
    notContains?: string[];
  };
  meta?: {
    truncated?: boolean | null;
    timedOut?: boolean | null;
    exitCode?: number | null;
    signal?: string | null;
    limitBytes?: number | null;
  };
  files?: {
    changed?: string[];
    unchanged?: string[];
    contentEquals?: Record<string, string>;
    contentContains?: Record<string, string[]>;
    contentNotContains?: Record<string, string[]>;
    exists?: string[];
    notExists?: string[];
  };
}

export interface SnapshotEntry {
  exists: boolean;
  content?: string;
}

export interface NormalizedResult {
  ok: boolean;
  code: string | null;
  output: string | null;
  error: string | null;
  meta: {
    truncated: boolean | null;
    timedOut: boolean | null;
    exitCode: number | null;
    signal: string | null;
    limitBytes: number | null;
  };
}
