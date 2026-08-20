import { LocalRootSelector } from "@/components/harness/LocalRootSelector";
import { Settings, Shield } from "lucide-react";

export default function WorkspaceSettingsPage({ params }: { params: { id: string } }) {
  const workspaceId = params.id;

  return (
    <div className="min-h-screen px-3 sm:px-4 md:px-10 lg:px-16 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 md:space-y-8">
      <div className="space-y-2 sm:space-y:3">
        <div className="inline-flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium">
          <Settings className="w-3 h-3 sm:w-4 sm:h-4 text-slate-500" />
          Workspace Settings
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">Agent Permissions</h1>
        <p className="text-xs sm:text-sm md:text-base text-muted-foreground max-w-2xl">
          Configure security bounds, execution permissions, and local directory access for this workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:gap-8">
        <section className="space-y-3 sm:space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
            <h2 className="text-lg sm:text-xl font-semibold">Local Root Grants</h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-3xl">
            Authorize specific directories on your local machine for the agent to access.
          </p>
          <LocalRootSelector workspaceId={workspaceId} />
        </section>
      </div>
    </div>
  );
}
