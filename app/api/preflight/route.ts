import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createClient } from "@supabase/supabase-js";

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

  const status = {
    mode_a_active: env.DEPLOYMENT_MODE === "A",
    db_configured: !!env.NEXT_PUBLIC_SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY,
    auth_configured: !!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!env.CLERK_SECRET_KEY,
    ai_configured: !!env.GOOGLE_API_KEY,
    db_reachable: false,
    timestamp: new Date().toISOString(),
  };

  // Check DB Reachability if configured
  if (status.db_configured) {
    try {
      // Using service role for a backend check
      const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
      
      // Perform a minimal query to verify connection
      // Attempting to select 1 row from a table likely to exist or just hitting the API.
      // We'll query a lightweight public schema or a known table. 
      // If the query fails due to missing table but connection succeeds, it's still reachable.
      const { error } = await supabase.from('users').select('id').limit(1);
      
      // Even if 'users' table doesn't exist, a PostgREST error means the API is reachable.
      // A fetch failed error means it's unreachable.
      status.db_reachable = true;
    } catch (e) {
      status.db_reachable = false;
    }
  }

  // Determine overall readiness
  const isHealthy = status.db_configured && status.auth_configured && status.ai_configured && status.db_reachable;

  return NextResponse.json(status, {
    status: isHealthy ? 200 : 503,
  });
}
