"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useLocale } from "next-intl";
import { Brain, MessageSquare, FileText, Workflow, Layers3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  kind: string;
  is_default: boolean;
  onboarding_state: string;
}

export default function WorkspaceHomePage() {
  const params = useParams();
  const locale = useLocale();
  const workspaceId = String(params?.id || '');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/workspaces');
        const data = await res.json();
        const found = (data.workspaces || []).find((item: Workspace) => item.id === workspaceId);
        if (found) setWorkspace(found);
      } catch (error) {
        console.error('Failed to load workspace:', error);
      }
    };
    if (workspaceId) load();
  }, [workspaceId]);

  return (
    <div className="min-h-screen px-4 md:px-10 lg:px-16 py-8 space-y-8">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300 text-sm font-medium">
          <Layers3 className="w-4 h-4" />
          Workspace overview
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{workspace?.name || 'Workspace'}</h1>
        <p className="text-muted-foreground max-w-2xl">
          {workspace?.description || 'This workspace will become the home for shared memory, prepared context, conversations, and durable outputs.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Link href={`/${locale}/workspaces/${workspaceId}/conversation`}>
          <Card className="p-6 h-full hover:border-violet-500/30 transition-colors">
            <div className="space-y-3">
              <MessageSquare className="w-6 h-6 text-violet-500" />
              <h2 className="font-semibold">Conversation</h2>
              <p className="text-sm text-muted-foreground">Ask, retrieve, draft, and continue work inside this workspace.</p>
            </div>
          </Card>
        </Link>

        <Link href={`/${locale}/workspaces/${workspaceId}/memory`}>
          <Card className="p-6 h-full hover:border-purple-500/30 transition-colors">
            <div className="space-y-3">
              <Brain className="w-6 h-6 text-purple-500" />
              <h2 className="font-semibold">Memory</h2>
              <p className="text-sm text-muted-foreground">Inspect what Tech Genie remembers here and shape the context it will reuse.</p>
            </div>
          </Card>
        </Link>

        <Card className="p-6 h-full border-dashed">
          <div className="space-y-3">
            <FileText className="w-6 h-6 text-slate-500" />
            <h2 className="font-semibold">Artifacts</h2>
            <p className="text-sm text-muted-foreground">Durable outputs will live here in the next slice.</p>
          </div>
        </Card>

        <Card className="p-6 h-full border-dashed">
          <div className="space-y-3">
            <Workflow className="w-6 h-6 text-slate-500" />
            <h2 className="font-semibold">Workflows</h2>
            <p className="text-sm text-muted-foreground">Structured runs and agent actions will plug into this workspace.</p>
          </div>
        </Card>
      </div>

      <Card className="p-6 space-y-4">
        <h3 className="text-lg font-semibold">Why this matters</h3>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Instead of dropping you into a generic AI tool grid, this workspace is the new container that connects memory, conversation, context, and outputs. It is the first step toward making the app match the landing-page promise.
        </p>
        <Link href={`/${locale}/workspaces/${workspaceId}/conversation`}>
          <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90">
            Continue into workspace conversation
          </Button>
        </Link>
      </Card>
    </div>
  );
}
