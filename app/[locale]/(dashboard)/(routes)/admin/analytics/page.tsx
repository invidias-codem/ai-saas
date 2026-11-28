"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Loader2, AlertCircle, TrendingUp, Users, MousePointerClick } from "lucide-react";

interface MetricsData {
  lookback_days: number;
  generated_at: string;
  landing_variants: Record<string, number>;
  delta_verdicts: Record<string, number>;
  plg_nudges_shown: number;
  stripe_checkouts_initiated: number;
  stripe_checkouts_completed: number;
  debate_rounds_total: number;
  debate_loops_accepted: number;
  debate_rounds_avg: number;
  bluesky_drafts_created: number;
  bluesky_drafts_approved: number;
  bluesky_drafts_rejected: number;
  total_events: number;
}

const VARIANT_LABELS: Record<string, string> = {
  a: "A — Productivity-led",
  b: "B — Enterprise-control-led",
  c: "C — Expert-capacity-led",
};

const VARIANT_COLORS: Record<string, string> = {
  a: "#8b5cf6",
  b: "#3b82f6",
  c: "#ec4899",
};

export default function AnalyticsPage() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: MetricsData) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <span>Failed to load metrics: {error}</span>
      </div>
    );
  }

  if (!data) return null;

  const variantChartData = Object.entries(data.landing_variants || {}).map(
    ([variant, count]) => ({
      variant,
      label: VARIANT_LABELS[variant] ?? variant,
      count,
    })
  );

  const totalVariants = variantChartData.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Funnel Analytics</h1>
        <p className="text-sm text-white/50 mt-1">
          Last {data.lookback_days} days · Updated{" "}
          {new Date(data.generated_at).toLocaleString()}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<MousePointerClick className="h-5 w-5" />}
          label="Variant Views"
          value={totalVariants.toLocaleString()}
        />
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Stripe Checkouts"
          value={data.stripe_checkouts_completed?.toLocaleString() ?? "0"}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Debate Loops"
          value={data.debate_loops_accepted?.toLocaleString() ?? "0"}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Total Events"
          value={data.total_events?.toLocaleString() ?? "0"}
        />
      </div>

      {/* Landing Variant Distribution */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-lg font-semibold text-white mb-1">
          A/B Test: Hero Variant Distribution
        </h2>
        <p className="text-sm text-white/50 mb-6">
          Unique visitors per variant (sticky cookie assignment)
        </p>

        {variantChartData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-white/40 text-sm">
            No variant data yet — waiting for traffic
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={variantChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1f",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  color: "#fff",
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {variantChartData.map((entry) => (
                  <Cell
                    key={entry.variant}
                    fill={VARIANT_COLORS[entry.variant] ?? "#6b7280"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Variant breakdown */}
        {variantChartData.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            {variantChartData.map((d) => (
              <div
                key={d.variant}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="text-xs text-white/40 mb-1">{d.label}</div>
                <div className="text-2xl font-bold">{d.count.toLocaleString()}</div>
                <div className="text-xs text-white/50 mt-1">
                  {totalVariants > 0
                    ? `${((d.count / totalVariants) * 100).toFixed(1)}%`
                    : "0%"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stripe Funnel */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Stripe Checkout Funnel</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs text-white/40 mb-1">Initiated</div>
            <div className="text-2xl font-bold">
              {(data.stripe_checkouts_initiated ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs text-white/40 mb-1">Completed</div>
            <div className="text-2xl font-bold">
              {(data.stripe_checkouts_completed ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2 text-white/50 mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}
