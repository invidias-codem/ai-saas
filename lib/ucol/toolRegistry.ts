/**
 * lib/ucol/toolRegistry.ts
 *
 * UCOL Tool Registry — manages CLI-Anything harnesses.
 * Exposes a singleton registry that fetches state from Supabase.
 */

import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolNode {
  id: string;
  name: string;           // "supabase" | "gh" | "firebase"
  binary: string;         // "cli-anything-supabase"
  version: string | null;
  capabilities: string[]; // top-level command groups
  taskTypes: string[];    // UCOL task type mappings
  isAvailable: boolean;   // false if binary not found in PATH
  installedAt: string;
  lastVerified: string;
}

export class ToolRegistry {
  private tools: Map<string, ToolNode> = new Map();
  private lastFetched = 0;
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  private supabaseUrl: string;
  private serviceKey: string;

  constructor() {
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    this.serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!this.supabaseUrl || !this.serviceKey) {
      console.warn('[ToolRegistry] Missing Supabase credentials. Registry will be empty.');
    }
  }

  // ─── Core API ────────────────────────────────────────────────────────────────

  /**
   * Fetch latest harness state from Supabase (cached for 1 hour).
   */
  async discover(): Promise<ToolNode[]> {
    if (Date.now() - this.lastFetched < this.CACHE_TTL_MS && this.tools.size > 0) {
      return Array.from(this.tools.values());
    }

    if (!this.supabaseUrl || !this.serviceKey) return [];

    const supabase = createClient(this.supabaseUrl, this.serviceKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from('ucol_tool_registry')
      .select('*');

    if (error) {
      console.error('[ToolRegistry] Failed to fetch tools from Supabase:', error);
      return Array.from(this.tools.values());
    }

    this.tools.clear();
    const rows = (data || []) as Record<string, unknown>[];

    for (const row of rows) {
      const node: ToolNode = {
        id: String(row.id),
        name: String(row.name),
        binary: String(row.binary),
        version: row.version ? String(row.version) : null,
        capabilities: (row.capabilities as string[]) ?? [],
        taskTypes: (row.task_types as string[]) ?? [],
        isAvailable: Boolean(row.is_available),
        installedAt: String(row.installed_at),
        lastVerified: String(row.last_verified),
      };

      this.tools.set(node.name, node);
    }

    this.lastFetched = Date.now();
    return Array.from(this.tools.values());
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  /** Get a tool by harness name (e.g. "supabase") */
  get(name: string): ToolNode | undefined {
    return this.tools.get(name);
  }

  /**
   * Find the first available tool that claims the given taskType.
   * If multiple tools claim it, the first one found is returned.
   */
  getByTaskType(taskType: string): ToolNode | undefined {
    for (const tool of this.tools.values()) {
      if (tool.isAvailable && tool.taskTypes.includes(taskType)) {
        return tool;
      }
    }
    return undefined;
  }

  /**
   * Check if a harness is installed and available in PATH.
   */
  isInstalled(name: string): boolean {
    const tool = this.tools.get(name);
    return tool ? tool.isAvailable : false;
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

let registryInstance: ToolRegistry | null = null;

export async function getToolRegistry(): Promise<ToolRegistry> {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
    await registryInstance.discover();
  }
  return registryInstance;
}
