import {
  resolveGovernance,
  deriveContextRole,
  invalidateGovernanceCache,
} from "@/lib/telemetry/governance";
import type { GovernanceState } from "@/lib/telemetry/udif";

describe("governance resolver", () => {
  afterEach(() => invalidateGovernanceCache());

  it("deriveContextRole maps workspace -> workspace:<id>", () => {
    expect(deriveContextRole({ workspaceId: "ws-1" })).toBe("workspace:ws-1");
  });

  it("deriveContextRole maps profile -> profile:<id> when no workspace", () => {
    expect(deriveContextRole({ operatingProfileId: "op-9" })).toBe("profile:op-9");
  });

  it("deriveContextRole falls back to public_baseline", () => {
    expect(deriveContextRole({})).toBe("public_baseline");
  });

  it("falls back to public_baseline default when supabase is missing", async () => {
    // With no supabaseAdmin mock returning data, resolver degrades to baseline.
    const state = await resolveGovernance({ contextRole: "public_baseline" });
    expect(state.context_role).toBe("public_baseline");
    expect(state.active_modules).toContain("general_reasoning");
    expect(state.disabled_modules).toContain("offensive_cybersecurity");
  });

  it("returns a valid GovernanceState shape", async () => {
    const state: GovernanceState = await resolveGovernance({ contextRole: "public_baseline" });
    expect(Array.isArray(state.active_modules)).toBe(true);
    expect(Array.isArray(state.disabled_modules)).toBe(true);
    expect(Array.isArray(state.defense_triggers)).toBe(true);
  });

  it("is non-throwing on arbitrary role", async () => {
    await expect(resolveGovernance({ contextRole: "nonexistent-role-xyz" })).resolves.toBeDefined();
  });
});
