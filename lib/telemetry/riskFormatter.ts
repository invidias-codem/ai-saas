/**
 * lib/telemetry/riskFormatter.ts
 *
 * Pure formatter helpers for the `lattice risk` CLI.
 * No network, no Supabase — just ANSI/ASCII rendering.
 */

export type Metric = {
  event_type: string;
  total_occurrences_30d: number;
  projected_aro: number;
  current_ale_usd: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
};

// ANSI helpers
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const GREEN = '\x1b[32m';

const SEVERITY_COLOR: Record<string, string> = {
  critical: BOLD + RED,
  high: YELLOW,
  medium: BLUE,
  low: GREEN,
};

export function colorForSeverity(severity: string): string {
  return SEVERITY_COLOR[severity] ?? RESET;
}

export function formatUsd(value: number): string {
  if (value >= 1000) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

export function renderTable(metrics: Metric[]): string {
  const headers = ['Event Type', '30d Count', 'Proj. ARO', 'Current ALE', 'Severity'];
  const rows: string[][] = metrics.map((m) => [
    m.event_type,
    String(m.total_occurrences_30d),
    m.projected_aro.toFixed(2),
    formatUsd(m.current_ale_usd),
    m.severity,
  ]);

  const widths = headers.map((h, i) => {
    const maxHeader = h.length;
    const maxRow = rows.reduce((max, row) => Math.max(max, row[i].length), 0);
    return Math.max(maxHeader, maxRow);
  });

  const sep = '+--' + widths.map((w) => '-'.repeat(w + 2)).join('-+-') + '--+';
  const formatRow = (cells: string[]) => '| ' + cells.map((cell, i) => cell.padEnd(widths[i])).join(' | ') + ' |';

  const lines: string[] = [];
  lines.push(sep);
  lines.push(formatRow(headers));
  lines.push(sep);

  for (const row of rows) {
    const sev = row[4];
    const color = colorForSeverity(sev);
    const coloredRow = '| ' + row.map((cell, i) => color + cell.padEnd(widths[i]) + RESET).join(' | ') + ' |';
    lines.push(coloredRow);
    lines.push(sep);
  }

  const totalAle = metrics.reduce((sum, m) => sum + m.current_ale_usd, 0);
  const footer = `Total Platform Risk (30d ALE): ${formatUsd(totalAle)}`;
  const paddedFooter = footer.padEnd(sep.length - 2);
  lines.push('| ' + BOLD + paddedFooter + RESET + ' |');
  lines.push(sep);

  return lines.join('\n');
}
