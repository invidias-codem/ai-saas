"use client";

import { useLocale } from "next-intl";
import { Terminal, Shield, Activity, HardDrive, Zap, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHarnessHeartbeat } from "@/hooks/useHarnessHeartbeat";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export default function LocalCapabilitiesPage() {
  const locale = useLocale();
  const { isDaemonRunning, lastHeartbeat, auditLogs } = useHarnessHeartbeat();

  return (
    <div className="min-h-screen px-4 md:px-10 lg:px-16 py-8 space-y-8">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-sm font-medium">
          <Terminal className="w-4 h-4" />
          Advanced Setup
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Lattice Local Command Center</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Monitor your local Go sidecar and Tauri IPC boundaries. When connected, Lattice unlocks deep codebase indexing, real-time file sync, and native execution capabilities.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Go IPC Daemon
            </h2>
            {isDaemonRunning ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20">
                <XCircle className="w-3 h-3 mr-1" /> Disconnected
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            The core engine bridging the web interface to your operating system via cryptographically secure Named Pipes / Unix Sockets.
          </p>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-blue-500" />
              Local File Sync
            </h2>
            {isDaemonRunning ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Active</Badge>
            ) : (
              <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20">Inactive</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Allows the Multi-Agent Swarm to directly read and mutate your local workspace files safely.
          </p>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-rose-500" />
              Telemetry Engine
            </h2>
            {isDaemonRunning ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Active</Badge>
            ) : (
              <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20">Inactive</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Tracks diagnostic heartbeat signals and hardware resource allocation limits.
          </p>
        </Card>
      </div>

      {!isDaemonRunning && (
        <Card className="p-8 border-dashed border-2 border-indigo-500/30 bg-indigo-500/5">
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Terminal className="w-6 h-6" />
                Boot the Local Harness
              </h2>
              <p className="text-muted-foreground max-w-3xl">
                Lattice is running in standard web mode. To unlock the Tier 2 capabilities, you need to boot the Tauri shell and the Go daemon locally on your machine.
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-950 rounded-lg p-4 font-mono text-sm text-slate-300 overflow-x-auto">
                <div className="flex items-center gap-4">
                  <span className="text-slate-500">$</span>
                  <span className="text-green-400">git</span> clone https://github.com/invidias-codem/ai-saas.git
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-500">$</span>
                  <span className="text-green-400">cd</span> ai-saas
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-500">$</span>
                  <span className="text-green-400">pnpm</span> install
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-slate-500"># Start the native Tauri app and daemon</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-500">$</span>
                  <span className="text-green-400">pnpm</span> tauri dev
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {isDaemonRunning && (
        <Card className="p-6 space-y-4 border-emerald-500/20 bg-emerald-500/5">
          <div className="space-y-2">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-emerald-500" />
              Security Audit Stream
            </h2>
            <p className="text-sm text-muted-foreground">
              A transparent, real-time log of the exact payloads crossing the OS boundary between the web UI and your filesystem.
              Last successful ping: {lastHeartbeat?.toLocaleTimeString() || "Pending..."}
            </p>
          </div>

          <ScrollArea className="h-72 rounded-md border bg-slate-950/50 p-4">
            {auditLogs.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-10 font-mono">
                Listening for IPC events on the Unix Socket / Named Pipe...
              </div>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="text-xs font-mono space-y-1 pb-3 border-b border-slate-800/50 last:border-0">
                    <div className="flex items-center gap-2 text-slate-400">
                      <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider
                        ${log.type === 'execution' ? 'bg-rose-500/20 text-rose-400' : 
                          log.type === 'read' ? 'bg-blue-500/20 text-blue-400' : 
                          log.type === 'sync' ? 'bg-indigo-500/20 text-indigo-400' : 
                          'bg-emerald-500/20 text-emerald-400'}`}
                      >
                        {log.type}
                      </span>
                    </div>
                    <div className="text-slate-200">
                      {log.description}
                    </div>
                    {log.payload && (
                      <div className="text-slate-500 mt-1 truncate">
                        payload: {JSON.stringify(log.payload)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}
