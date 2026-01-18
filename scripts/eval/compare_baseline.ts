import fs from "fs";
import path from "path";

type EvalReport = {
  generatedAt: string;
  datasetPath: string;
  runId: string;
  model: string;
  counts: {
    total: number;
    passed: number;
    failed: number;
  };
};

type Baseline = {
  model: string;
  thresholds: {
    maxFailureRateIncrease: number; // e.g. 0.05 for +5%
    maxFailureRateAbsolute: number; // e.g. 0.2 for 20% failures hard cap
  };
  counts: {
    total: number;
    passed: number;
    failed: number;
  };
};

function parseArg(name: string, defaultValue?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return defaultValue;
  return process.argv[idx + 1] ?? defaultValue;
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function failureRate(counts: { total: number; failed: number }): number {
  return counts.total === 0 ? 0 : counts.failed / counts.total;
}

async function main() {
  const reportPath = parseArg("report", "eval/report.json");
  const baselinePath = parseArg("baseline", "eval/baseline.json");

  if (!reportPath || !baselinePath) {
    console.error("Missing --report or --baseline");
    process.exit(1);
  }

  if (!fs.existsSync(reportPath)) {
    console.error(`Eval report not found: ${reportPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(baselinePath)) {
    console.error(`Baseline not found: ${baselinePath}`);
    process.exit(1);
  }

  const report = readJson<EvalReport>(reportPath);
  const baseline = readJson<Baseline>(baselinePath);

  const reportFailure = failureRate({ total: report.counts.total, failed: report.counts.failed });
  const baseFailure = failureRate({ total: baseline.counts.total, failed: baseline.counts.failed });

  const increase = reportFailure - baseFailure;

  const lines: string[] = [];
  lines.push(`# Eval Baseline Comparison`);
  lines.push("");
  lines.push(`- Model: ${report.model}`);
  lines.push(`- Report: ${path.resolve(reportPath)}`);
  lines.push(`- Baseline: ${path.resolve(baselinePath)}`);
  lines.push("");
  lines.push(`## Failure Rate`);
  lines.push("");
  lines.push(`- Baseline: ${(baseFailure * 100).toFixed(2)}% (${baseline.counts.failed}/${baseline.counts.total})`);
  lines.push(`- Current:  ${(reportFailure * 100).toFixed(2)}% (${report.counts.failed}/${report.counts.total})`);
  lines.push(`- Delta:    ${(increase * 100).toFixed(2)}%`);
  lines.push("");

  const hardFail = reportFailure > baseline.thresholds.maxFailureRateAbsolute;
  const regressionFail = increase > baseline.thresholds.maxFailureRateIncrease;

  if (hardFail) {
    lines.push(`❌ Hard fail: failure rate ${(reportFailure * 100).toFixed(2)}% exceeds absolute cap ${(baseline.thresholds.maxFailureRateAbsolute * 100).toFixed(2)}%`);
  }
  if (regressionFail) {
    lines.push(`❌ Regression: failure rate increased by ${(increase * 100).toFixed(2)}% which exceeds allowed ${(baseline.thresholds.maxFailureRateIncrease * 100).toFixed(2)}%`);
  }
  if (!hardFail && !regressionFail) {
    lines.push(`✅ PASS: within thresholds`);
  }

  const outPath = path.join(path.dirname(reportPath), "baseline_comparison.md");
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote baseline comparison to ${outPath}`);

  if (hardFail || regressionFail) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("Compare failed:", err);
  process.exit(1);
});
