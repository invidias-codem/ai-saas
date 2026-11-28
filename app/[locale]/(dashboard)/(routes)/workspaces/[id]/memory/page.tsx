"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Brain, Pin, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

interface MemoryItem {
  id: string;
  content: string;
  type: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export default function WorkspaceMemoryPage() {
  const params = useParams();
  const workspaceId = String(params?.id || '');
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/memory/list?limit=12');
        const data = await res.json();
        const filtered = (data.memories || []).filter((memory: MemoryItem) => {
          const meta = memory.metadata || {};
          return meta.workspaceId === workspaceId || meta.workspace_id === workspaceId;
        });
        setMemories(filtered);
      } catch (error) {
        console.error('Failed to load workspace memories:', error);
      } finally {
        setLoading(false);
      }
    };
    if (workspaceId) load();
  }, [workspaceId]);

  return (
    <div className="min-h-screen px-3 sm:px-4 md:px-10 lg:px-16 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 md:space-y-8">
      <div className="space-y-2 sm:space-y:3">
        <div className="inline-flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs sm:text-sm font-medium">
          <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
          Workspace memory
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">Memory in this workspace</h1>
        <p className="text-xs sm:text-sm md:text-base text-muted-foreground max-w-2xl">
          This is the first visible step toward workspace-scoped memory.
        </p>
      </div>

      {loading ? (
        <Card className="p-6">Loading workspace memory...</Card>
      ) : memories.length === 0 ? (
        <Card className="p-8 text-center space-y-3 border-dashed">
          <Brain className="w-10 h-10 mx-auto text-purple-500/40" />
          <h2 className="font-semibold">No workspace memories yet</h2>
          <p className="text-sm text-muted-foreground">
            As conversations and future workflows become workspace-aware, relevant memories will begin to collect here.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {memories.map((memory) => (
            <Card key={memory.id} className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs px-2 py-1 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                  {memory.type}
                </div>
                <Pin className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-sm leading-relaxed">{memory.content}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
