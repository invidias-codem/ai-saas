import { z } from "zod";

export const ProviderHealthStatus = z.enum(["HEALTHY", "DEGRADED", "DEAD"]);

export interface ProviderHealthRecord {
  status: "HEALTHY" | "DEGRADED" | "DEAD";
  lastChecked: string;
  failureCount: number;
  lastFailureReason?: string;
  lastFailureAt?: string;
}

import type { SupabaseKV } from "@/lib/state/kv";

export class ProviderHealthChecker {
  private records: Map<string, ProviderHealthRecord> = new Map();
  private readonly deadTTLMs = 5 * 60 * 1000; // 5 minutes
  private kv?: SupabaseKV;

  constructor(
    private readonly allProviders: string[],
    initialHealth?: Record<string, ProviderHealthRecord>,
    kv?: SupabaseKV,
  ) {
    this.kv = kv;
    if (initialHealth) {
      for (const [key, record] of Object.entries(initialHealth)) {
        this.records.set(key, record);
      }
    } else {
      for (const key of this.allProviders) {
        this.records.set(key, {
          status: "HEALTHY",
          lastChecked: new Date().toISOString(),
          failureCount: 0,
        });
      }
    }
  }

  isAvailable(providerKey: string): boolean {
    const record = this.records.get(providerKey);
    if (!record) return false;

    if (record.status === "DEAD") {
      if (record.lastFailureAt) {
        const age = Date.now() - new Date(record.lastFailureAt).getTime();
        if (age > this.deadTTLMs) {
          this.records.set(providerKey, {
            status: "HEALTHY",
            lastChecked: new Date().toISOString(),
            failureCount: record.failureCount,
          });
          return true;
        }
      }
      return false;
    }

    return true;
  }

  markDead(providerKey: string, reason: string): void {
    const existing = this.records.get(providerKey);
    this.records.set(providerKey, {
      status: "DEAD",
      lastChecked: new Date().toISOString(),
      failureCount: (existing?.failureCount ?? 0) + 1,
      lastFailureReason: reason,
      lastFailureAt: new Date().toISOString(),
    });
  }

  markDegraded(providerKey: string, reason: string): void {
    const existing = this.records.get(providerKey);
    this.records.set(providerKey, {
      status: "DEGRADED",
      lastChecked: new Date().toISOString(),
      failureCount: (existing?.failureCount ?? 0) + 1,
      lastFailureReason: reason,
    });
  }

  markHealthy(providerKey: string): void {
    this.records.set(providerKey, {
      status: "HEALTHY",
      lastChecked: new Date().toISOString(),
      failureCount: 0,
    });
  }

  getRecord(providerKey: string): ProviderHealthRecord | undefined {
    return this.records.get(providerKey);
  }

  getAllRecords(): Record<string, ProviderHealthRecord> {
    return Object.fromEntries(this.records);
  }

  getModel(providerKey: string): string {
    const MODEL_MAP: Record<string, string> = {
      "deepseek": "deepseek-ai/deepseek-v4-pro-0813",
      "gemini-ultra": "gemini-2.0-flash-exp",
      "gemini-pro": "gemini-2.0-flash-exp",
      "gemini-flash": "gemini-2.0-flash-exp",
    };
    return MODEL_MAP[providerKey] ?? providerKey;
  }
}
