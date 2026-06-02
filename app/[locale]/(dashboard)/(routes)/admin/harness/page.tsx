import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { Activity, CheckCircle, ShieldAlert, Clock, XCircle, FileText, Database } from 'lucide-react';
import { LocalRootSelector } from '@/components/harness/LocalRootSelector';

export default async function HarnessDashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  if (!supabaseAdmin) {
    return <div className="p-8 text-destructive">Supabase Admin not configured</div>;
  }

  // Fetch metrics: Total ops, Success rate, Denied/Path violations, Avg Duration
  // We'll fetch the last 1000 events for the user to aggregate
  const { data: events, error } = await supabaseAdmin
    .from('harness_telemetry_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1000);

  // Fetch the user's primary workspace to prevent scope leakage
  const { data: workspaces, error: wsError } = await supabaseAdmin
    .from('workspaces')
    .select('id')
    // We assume there's a join or user_id column on workspaces in standard SaaS starter
    // Alternatively, if it's a many-to-many, we'd fetch from workspace_members
    .limit(1);
    
  // For the sake of the dashboard, if they have no workspace, we fall back to their user ID to ensure isolation
  const activeWorkspaceId = workspaces && workspaces.length > 0 ? workspaces[0].id : userId;

  if (error) {
    return <div className="p-8 text-destructive">Error loading telemetry: {error.message}</div>;
  }

  const totalOps = events ? events.length : 0;
  
  const readEvents = events ? events.filter(e => 
    e.event_type === 'file_read' || e.event_type === 'directory_list' || e.event_type === 'stat_path'
  ) : [];

  const mutationEvents = events ? events.filter(e => 
    e.event_type === 'file_write' || e.event_type === 'file_create' || 
    e.event_type === 'directory_create' || e.event_type === 'path_move' || e.event_type === 'path_delete'
  ) : [];

  const intelligenceEvents = events ? events.filter(e => 
    e.event_type === 'document_discovery_success' || e.event_type === 'document_extract_success' || 
    e.event_type === 'repo_summary_success'
  ) : [];

  const unsupportedInputEvents = events ? events.filter(e => 
    e.event_type === 'unsupported_local_input'
  ).length : 0;

  const mutationDenials = events ? events.filter(e => 
    e.event_type === 'mutation_denied' || e.event_type === 'destructive_action_denied'
  ).length : 0;
  
  const containmentDrops = events ? events.filter(e => 
    e.event_type === 'root_access_denied' || e.event_type === 'path_violation_blocked'
  ).length : 0;
  
  const deniedEvents = events ? events.filter(e => 
    e.event_type === 'root_access_denied' || 
    e.event_type === 'path_violation_blocked' || 
    e.event_type === 'mutation_denied' || 
    e.event_type === 'destructive_action_denied'
  ) : [];

  const topDeniedTools = deniedEvents.reduce((acc, e) => {
    const tool = e.operation_type || 'unknown';
    acc[tool] = (acc[tool] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedDeniedTools = Object.entries(topDeniedTools)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 5);

  const errorEvents = events ? events.filter(e => !e.success && e.error_message) : [];
  const topErrors = errorEvents.reduce((acc, e) => {
    // Basic error categorization for the dashboard
    let errClass = 'Unknown Error';
    if (e.error_message.includes('403')) errClass = '403 Forbidden';
    else if (e.error_message.includes('Containment')) errClass = 'Containment Violation';
    else if (e.error_message.includes('Read-Only')) errClass = 'Read-Only Rejection';
    else if (e.error_message.includes('Destructive')) errClass = 'Destructive Disallowed';
    else if (e.error_message.includes('Timeout')) errClass = 'RPC Timeout';
    else errClass = e.error_message.substring(0, 40) + '...';

    acc[errClass] = (acc[errClass] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedTopErrors = Object.entries(topErrors)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 5);

  const totalDuration = events ? events.reduce((acc, e) => acc + (e.duration_ms || 0), 0) : 0;
  const avgDuration = totalOps > 0 ? (totalDuration / totalOps).toFixed(2) : 0;

  const recentEvents = events ? events.slice(0, 10) : [];

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Local Harness Health</h2>
      </div>

      <LocalRootSelector workspaceId={activeWorkspaceId} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Total Operations</h3>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{totalOps}</div>
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Read Volume</h3>
            <FileText className="h-4 w-4 text-blue-500" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{readEvents.length}</div>
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Mutation Volume</h3>
            <Database className="h-4 w-4 text-purple-500" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{mutationEvents.length}</div>
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Intelligence Intake</h3>
            <Activity className="h-4 w-4 text-green-500" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{intelligenceEvents.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{unsupportedInputEvents} unsupported</p>
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Containment Drops</h3>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{containmentDrops}</div>
            <p className="text-xs text-muted-foreground mt-1">WAF path drops</p>
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Mutation Denials</h3>
            <XCircle className="h-4 w-4 text-red-500" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{mutationDenials}</div>
            <p className="text-xs text-muted-foreground mt-1">Blocked by read-only roots</p>
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Avg Duration</h3>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{avgDuration}ms</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4 rounded-xl border bg-card text-card-foreground shadow">
          <div className="flex flex-col space-y-1.5 p-6">
            <h3 className="font-semibold leading-none tracking-tight">Recent Live Telemetry</h3>
            <p className="text-sm text-muted-foreground">Latest actions executed by your local daemon.</p>
          </div>
          <div className="p-6 pt-0">
            <div className="space-y-4">
              {recentEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-4">
                  <div className="bg-muted p-2 rounded-full">
                    {event.success ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">{event.event_type}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate max-w-[400px]">
                      {event.path_accessed || event.operation_type || 'N/A'}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground tabular-nums">
                    {event.duration_ms}ms
                  </div>
                </div>
              ))}
              {recentEvents.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">No events found.</div>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-3 rounded-xl border bg-card text-card-foreground shadow">
          <div className="flex flex-col space-y-1.5 p-6 pb-2">
            <h3 className="font-semibold leading-none tracking-tight">Diagnostics</h3>
          </div>
          <div className="p-6 pt-0 space-y-6">
            <div>
              <h4 className="text-sm font-medium mb-3">Top Denied Tools</h4>
              <div className="space-y-2">
                {sortedDeniedTools.map(([tool, count]) => (
                  <div key={tool} className="flex justify-between items-center">
                    <span className="text-sm font-mono text-muted-foreground">{tool}</span>
                    <span className="text-sm font-bold">{String(count)}</span>
                  </div>
                ))}
                {sortedDeniedTools.length === 0 && <p className="text-sm text-muted-foreground">No denials recorded.</p>}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-3">Top Error Classes</h4>
              <div className="space-y-2">
                {sortedTopErrors.map(([errClass, count]) => (
                  <div key={errClass} className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">{errClass}</span>
                    <span className="text-sm font-bold text-red-500">{String(count)}</span>
                  </div>
                ))}
                {sortedTopErrors.length === 0 && <p className="text-sm text-muted-foreground">No errors recorded.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
