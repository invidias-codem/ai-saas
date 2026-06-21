import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/lib/security/auditLog";
import { checkLicense } from "@/lib/api/license";

export const dynamic = 'force-dynamic';

// Helper to safely represent env presence without leaking values
function configured(value: unknown): boolean {
  return Boolean(value);
}

export async function GET(request: Request) {
  // Extract secret from either Authorization header or query parameter
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const providedSecret = querySecret || bearerToken;

  // Protect the route
  if (!env.PREFLIGHT_SECRET || providedSecret !== env.PREFLIGHT_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const required_env = {
    NEXT_PUBLIC_SUPABASE_URL: configured(env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: configured(env.SUPABASE_SERVICE_ROLE_KEY),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: configured(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    CLERK_SECRET_KEY: configured(env.CLERK_SECRET_KEY),
    GOOGLE_API_KEY: configured(env.GOOGLE_API_KEY),
    LATTICE_INSTANCE_ID: configured(env.LATTICE_INSTANCE_ID),
  };

  const db_configured = !!env.NEXT_PUBLIC_SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY;
  const auth_configured = !!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!env.CLERK_SECRET_KEY;
  const ai_configured = !!env.GOOGLE_API_KEY;

  let db_reachable = false;
  if (db_configured && env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supabase.from('users').select('id').limit(1);
      db_reachable = true;
    } catch (e) {
      db_reachable = false;
    }
  }
  let license_configured = false;
  let license_status: { tier: string; features: string[]; maxSeats: number; maxNodes: number } | null = null;
  if (env.LATTICE_INSTANCE_ID) {
    const license = await checkLicense(env.LATTICE_INSTANCE_ID);
    if (license) {
      license_configured = true;
      license_status = {
        tier: license.tier,
        features: license.featureGates,
        maxSeats: license.maxSeats,
        maxNodes: license.maxNodes,
      };
    }
  }

  const isHealthy = db_configured && auth_configured && ai_configured && db_reachable;

  const status = {
    mode_a_active: env.DEPLOYMENT_MODE === "A",
    db_configured,
    auth_configured,
    ai_configured,
    db_reachable,
    license_configured,
    license_status,
    required_env,
    timestamp: new Date().toISOString(),
  };

  void audit('preflight.check', 'system', {
    healthy: isHealthy,
    db_configured,
    auth_configured,
    license_configured,
  });

  return NextResponse.json(status, {
    status: isHealthy ? 200 : 503,
  });
}
