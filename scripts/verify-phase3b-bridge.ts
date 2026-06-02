import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { executeLocalDaemonTool } from '../lib/ai/tools/harness_bridge';

// Configuration
const CONFIG = {
  workspaceId: process.env.TEST_WORKSPACE_ID || 'test_workspace_1',
  userId: process.env.TEST_USER_ID || 'test_user_1',
  authToken: process.env.TEST_AUTH_TOKEN || 'test_auth_token_1',
  safeRoot: process.env.TEST_SAFE_ROOT || '/tmp/lattice_test_safe_root',
  mutableRoot: process.env.TEST_MUTABLE_ROOT || '/tmp/lattice_test_mutable_root',
  reportPath: 'scripts/phase3b_report.json'
};

// Scenario types
type ScenarioOutcome = 'pass' | 'fail';
interface Scenario {
  id: string;
  name: string;
  tool: string;
  args: Record<string, any>;
  expectedStatus: 'success' | 'denied' | 'error';
  expectedSubstrings?: string[];
}

interface ScenarioResult {
  id: string;
  tool: string;
  outcome: ScenarioOutcome;
  expected: string;
  durationMs: number;
  notes: string;
}

const scenarios: Scenario[] = [
  // Group A - Positive Path
  {
    id: 'A1',
    name: 'stat_path in-scope',
    tool: 'stat_path_secure',
    args: { path: `${CONFIG.safeRoot}/test.txt` },
    expectedStatus: 'success'
  },
  {
    id: 'A2',
    name: 'list_directory in-scope',
    tool: 'list_directory_secure',
    args: { path: CONFIG.safeRoot },
    expectedStatus: 'success'
  },
  {
    id: 'A3',
    name: 'read_file in-scope',
    tool: 'read_file_secure',
    args: { path: `${CONFIG.safeRoot}/test.txt` },
    expectedStatus: 'success'
  },
  // Group B - Mutable Positive Path
  {
    id: 'B1',
    name: 'create_directory in mutable root',
    tool: 'create_directory_secure',
    args: { path: `${CONFIG.mutableRoot}/new_dir` },
    expectedStatus: 'success'
  },
  {
    id: 'B2',
    name: 'write_file in mutable root',
    tool: 'write_file_secure',
    args: { path: `${CONFIG.mutableRoot}/new_dir/test.txt`, content: "Hello World" },
    expectedStatus: 'success'
  },
  // Group C - Denial Paths
  {
    id: 'C1',
    name: 'read-only mutation denial',
    tool: 'write_file_secure',
    args: { path: `${CONFIG.safeRoot}/test.txt`, content: "Should Fail" },
    expectedStatus: 'denied',
    expectedSubstrings: ['Read-Only']
  },
  {
    id: 'C2',
    name: 'out-of-bounds read denial',
    tool: 'read_file_secure',
    args: { path: `/etc/passwd` },
    expectedStatus: 'denied',
    expectedSubstrings: ['403', 'Forbidden']
  },
  {
    id: 'C3',
    name: 'out-of-bounds write denial',
    tool: 'write_file_secure',
    args: { path: `/tmp/outside_root.txt`, content: "Fail" },
    expectedStatus: 'denied',
    expectedSubstrings: ['403', 'Forbidden']
  },
  {
    id: 'C4',
    name: 'traversal denial',
    tool: 'read_file_secure',
    args: { path: `${CONFIG.safeRoot}/../../../etc/passwd` },
    expectedStatus: 'denied',
    expectedSubstrings: ['403', 'Forbidden']
  }
];

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const startTime = Date.now();
  let resultPayload: any;
  let isError = false;

  try {
    resultPayload = await executeLocalDaemonTool(
      scenario.tool,
      scenario.args,
      CONFIG.workspaceId,
      CONFIG.userId,
      CONFIG.authToken
    );
    if (resultPayload && resultPayload.error) {
      isError = true;
    }
  } catch (err: any) {
    resultPayload = { error: err.message };
    isError = true;
  }

  const durationMs = Date.now() - startTime;
  let outcome: ScenarioOutcome = 'fail';
  let notes = '';

  if (scenario.expectedStatus === 'success') {
    if (!isError && resultPayload?.Ok !== false) {
      outcome = 'pass';
      notes = 'Success as expected';
    } else {
      notes = `Expected success but got error: ${JSON.stringify(resultPayload)}`;
    }
  } else if (scenario.expectedStatus === 'denied' || scenario.expectedStatus === 'error') {
    if (isError || resultPayload?.Ok === false) {
      const errStr = JSON.stringify(resultPayload);
      const matchesAll = scenario.expectedSubstrings?.every(sub => errStr.includes(sub)) ?? true;
      if (matchesAll) {
        outcome = 'pass';
        notes = `Denied as expected: ${errStr}`;
      } else {
        notes = `Denied but missing expected substrings [${scenario.expectedSubstrings?.join(', ')}]. Got: ${errStr}`;
      }
    } else {
      notes = `CRITICAL: Expected denial but operation succeeded!`;
    }
  }

  return {
    id: scenario.id,
    tool: scenario.tool,
    outcome,
    expected: scenario.expectedStatus,
    durationMs,
    notes
  };
}

async function main() {
  console.log("==========================================");
  console.log("Phase 3B Verification Summary");
  console.log("==========================================");
  
  const results: ScenarioResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    const res = await runScenario(scenario);
    results.push(res);
    
    if (res.outcome === 'pass') {
      console.log(`\x1b[32mPASS\x1b[0m ${res.id} ${res.name}`);
      passed++;
    } else {
      console.log(`\x1b[31mFAIL\x1b[0m ${res.id} ${res.name} -> ${res.notes}`);
      failed++;
    }
  }

  console.log("\n------------------------------------------");
  console.log(`${passed} passed, ${failed} failed`);
  console.log("------------------------------------------");

  const report = {
    phase: "3B",
    timestamp: new Date().toISOString(),
    summary: {
      passed,
      failed,
      total: passed + failed
    },
    scenarios: results
  };

  fs.writeFileSync(CONFIG.reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${CONFIG.reportPath}`);
  console.log(`\n**TELEMETRY CORRELATION RECOMMENDATION**:`);
  console.log(`Please inspect the Lattice Dashboard / Supabase Telemetry table`);
  console.log(`to ensure all the above events (success and denials) were accurately tracked.`);
}

// Ignore execution if not run directly
if (require.main === module) {
  main().catch(err => {
    console.error("Fatal Script Error:", err);
    process.exit(1);
  });
}
