"use client";

import { useLocale } from "next-intl";
import { Terminal, Shield, Activity, HardDrive, Zap, CheckCircle2, XCircle, Monitor, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHarnessHeartbeat } from "@/hooks/useHarnessHeartbeat";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export default function LocalCapabilitiesPage() {
  const locale = useLocale();
  const { isDaemonRunning, lastHeartbeat, auditLogs, appFocused } = useHarnessHeartbeat();

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
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
              <Monitor className="w-5 h-5 text-purple-500" />
              Runtime Environment
            </h2>
            {typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window) ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Desktop
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                <Monitor className="w-3 h-3 mr-1" /> Browser
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Indicates whether Lattice is running as a native Tauri desktop app or in a standard web browser.
          </p>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              Native Secret Vault
            </h2>
            {(typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window)) ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Stronghold
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20">
                <Lock className="w-3 h-3 mr-1" /> Web Storage
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Provider API keys are stored in Tauri’s encrypted Stronghold vault on desktop, or in the standard web secret store in browser mode.
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
                Lattice is running in standard web mode. To unlock Tier 2 capabilities, start the Tauri shell and the Go daemon locally on your machine.
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
                  <span className="text-slate-500"># Start the native Tauri app + daemon</span>
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
