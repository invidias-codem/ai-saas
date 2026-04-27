"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { FolderKanban, Brain, Sparkles, ArrowRight, Cpu, Search, FileText, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface OperatingProfile {
  id: string;
  mode: 'copilot' | 'research' | 'agentic' | 'drafting' | 'memory_native' | 'custom';
  name: string;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  kind: string;
  is_default: boolean;
  onboarding_state: string;
  updated_at: string;
  default_operating_profile?: OperatingProfile | null;
}

function modeLabel(mode?: string) {
  switch (mode) {
    case 'research': return 'Research';
    case 'agentic': return 'Agentic';
    case 'drafting': return 'Drafting';
    case 'memory_native': return 'Memory';
    case 'copilot': return 'Copilot';
    default: return 'Custom';
  }
}

function modeIcon(mode?: string) {
  switch (mode) {
    case 'research': return Search;
    case 'agentic': return Zap;
    case 'drafting': return FileText;
    case 'memory_native': return Brain;
    case 'copilot': return Cpu;
    default: return Cpu;
  }
}

export default function WorkspacesPage() {
  const locale = useLocale();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/workspaces');
        const data = await res.json();
        if (res.ok) setWorkspaces(data.workspaces || []);
      } catch (error) {
        console.error('Failed to load workspaces:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen px-4 md:px-10 lg:px-16 py-8 space-y-8">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300 text-sm font-medium">
          <Sparkles className="w-4 h-4" />
          Workspace-first preview
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Your intelligence workspaces</h1>
        <p className="text-muted-foreground max-w-2xl">
          Workspaces are where conversation, memory, context, and outputs stay connected. Each workspace also carries an operating mode that shapes how Tech Genie behaves there.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading && <Card className="p-6">Loading workspaces...</Card>}

        {!loading && workspaces.length === 0 && (
          <Card className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300 font-medium">
              <FolderKanban className="w-5 h-5" />
              No workspaces yet
            </div>
            <p className="text-sm text-muted-foreground">Your default workspace will appear here once it is created.</p>
          </Card>
        )}

        {workspaces.map((workspace) => {
          const ModeIcon = modeIcon(workspace.default_operating_profile?.mode);
          return (
            <Card key={workspace.id} className="p-6 space-y-4 border-violet-500/10 hover:border-violet-500/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-semibold">{workspace.name}</h2>
                    {workspace.is_default && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20">
                        default
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 inline-flex items-center gap-1">
                      <ModeIcon className="w-3 h-3" />
                      {modeLabel(workspace.default_operating_profile?.mode)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{workspace.description || 'A connected space for memory, conversation, and artifacts.'}</p>
                </div>
                <Brain className="w-5 h-5 text-violet-500" />
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <div>Kind: {workspace.kind}</div>
                <div>State: {workspace.onboarding_state}</div>
                <div>Profile: {workspace.default_operating_profile?.name || 'Balanced Copilot'}</div>
              </div>

              <Link href={`/${locale}/workspaces/${workspace.id}`}>
                <Button className="w-full justify-between bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90">
                  Open workspace
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
