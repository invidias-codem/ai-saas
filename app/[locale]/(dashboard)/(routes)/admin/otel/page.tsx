"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";

type MetricRow = {
  rank: number;
  model_id: string;
  feature_type: string;
  provider?: string | null;
  intent_category?: string | null;
  execution_mode?: string | null;
  total_tokens: number;
  tokens_in: number;
  tokens_out: number;
  latency_ms?: number | null;
  created_at: string;
};

export default function OTelRankedMetrics() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const fetchRanked = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.id) {
        setError('Unauthorized');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('task_token_metrics')
        .select('model_id, feature_type, provider, intent_category, execution_mode, total_tokens, tokens_in, tokens_out, latency_ms, created_at')
        .eq('user_id', authData.user.id)
        .order('total_tokens', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const ranked: MetricRow[] = (data ?? []).map((row: any, index: number) => ({
        rank: index + 1,
        model_id: row.model_id,
        feature_type: row.feature_type,
        provider: row.provider ?? null,
        intent_category: row.intent_category ?? null,
        execution_mode: row.execution_mode ?? null,
        total_tokens: Number(row.total_tokens ?? 0),
        tokens_in: Number(row.tokens_in ?? 0),
        tokens_out: Number(row.tokens_out ?? 0),
        latency_ms: row.latency_ms ?? null,
        created_at: row.created_at,
      }));

      setMetrics(ranked);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load ranked metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    fetchRanked();
  }, [fetchRanked]);

  return (
    <div className="p-3 sm:p-6 md:p-8 h-full bg-gray-50 overflow-auto">
      <div className="mb-4 sm:mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">OTel Ranked Tasks</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Top token-consuming tasks across flows.</p>
        </div>

        <button
          onClick={fetchRanked}
          className="flex items-center gap-2 px-3 py-2 rounded-md border bg-white text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 sm:mb-6 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 sm:p-4 text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="text-xs text-gray-500 mb-2 sm:mb-3">Showing top task leaderboard by total tokens</div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : !metrics.length ? (
        <div className="text-center py-12 text-gray-500">No task metrics yet.</div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="sm:hidden space-y-2">
            {metrics.map((metric) => (
              <div key={`${metric.rank}-${metric.created_at}-${metric.model_id}`} className="bg-white rounded-lg border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">#{metric.rank}</span>
                  <span className="text-xs text-gray-500">{new Date(metric.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 capitalize">{metric.feature_type}</span>
                  <span className="text-xs font-mono text-gray-600 truncate">{metric.model_id}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {metric.provider && <span>{metric.provider} · </span>}
                  {metric.intent_category && <span>{metric.intent_category} · </span>}
                  {metric.execution_mode && <span>{metric.execution_mode}</span>}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">In: {metric.tokens_in.toLocaleString()}</span>
                  <span className="text-gray-500">Out: {metric.tokens_out.toLocaleString()}</span>
                  <span className="font-semibold">{metric.total_tokens.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block bg-white rounded-lg shadow border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3">Rank</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Model</th>
                    <th className="px-6 py-3">Provider</th>
                    <th className="px-6 py-3">Intent</th>
                    <th className="px-6 py-3">Execution</th>
                    <th className="px-6 py-3 text-right">Tokens In</th>
                    <th className="px-6 py-3 text-right">Tokens Out</th>
                    <th className="px-6 py-3 text-right">Total</th>
                    <th className="px-6 py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((metric) => (
                    <tr key={`${metric.rank}-${metric.created_at}-${metric.model_id}`} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-6 py-4 font-semibold text-gray-700">#{metric.rank}</td>
                      <td className="px-6 py-4 capitalize">{metric.feature_type}</td>
                      <td className="px-6 py-4 font-mono text-xs">{metric.model_id}</td>
                      <td className="px-6 py-4 text-xs">{metric.provider ?? 'n/a'}</td>
                      <td className="px-6 py-4 text-xs">{metric.intent_category ?? 'n/a'}</td>
                      <td className="px-6 py-4 text-xs">{metric.execution_mode ?? 'n/a'}</td>
                      <td className="px-6 py-4 text-right font-mono">{metric.tokens_in.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-mono">{metric.tokens_out.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-mono font-semibold">{metric.total_tokens.toLocaleString()}</td>
                      <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                        {new Date(metric.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
