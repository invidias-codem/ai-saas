import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Terminal } from 'lucide-react';
import { getDefaultWorkspace } from '@/lib/workspaces/defaultWorkspace';
import { CapabilitiesMonitor } from './CapabilitiesMonitor';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ locale: string }>;
}

export default async function LocalCapabilitiesPage({ params }: RouteParams) {
  const { locale } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }

  // Server-resolved workspace — the client island no longer waterfalls a
  // fetch to /api/workspaces/default before it can render status panels.
  let workspaceId = '';
  try {
    const workspace = await getDefaultWorkspace(userId);
    workspaceId = workspace.id;
  } catch {
    // Leave workspaceId empty; the client renders its "no workspace" state.
  }

  return (
    <div className="min-h-screen px-3 sm:px-4 md:px-10 lg:px-16 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 md:space-y-8">
      <div className="space-y-2 sm:space-y:3">
        <div className="inline-flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm font-medium">
          <Terminal className="w-3 h-3 sm:w-4 sm:h-4" />
          Advanced Setup
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">Lattice Local Command Center</h1>
        </div>
        <p className="text-xs sm:text-sm md:text-base text-muted-foreground max-w-2xl">
          Monitor your local Go sidecar and Tauri IPC boundaries.
        </p>
      </div>

      <CapabilitiesMonitor workspaceId={workspaceId} />
    </div>
  );
}
