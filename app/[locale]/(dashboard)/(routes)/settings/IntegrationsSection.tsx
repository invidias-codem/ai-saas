"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandIcon } from "@/lib/icons/brandIcons";
import { cn } from "@/lib/utils";
import { RepoSelectorModal } from "@/components/integrations/RepoSelectorModal";

interface IntegrationState {
  id: string;
  label: string;
  description: string;
  icon: string;
  connected: boolean;
  color: string;
  bgColor: string;
  username?: string | null;
  email?: string | null;
}

interface StatusProps {
  connected: boolean;
  username: string | null;
  email?: string | null;
}

interface Props {
  initialGithub: StatusProps;
  initialTrello: StatusProps;
}

function IntegrationsInner({ initialGithub, initialTrello }: Props) {
  const searchParams = useSearchParams();
  const [repoSelectorOpen, setRepoSelectorOpen] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationState[]>([
    {
      id: "github",
      label: "GitHub",
      description: "Sync with your repositories",
      icon: "Github",
      connected: initialGithub.connected,
      username: initialGithub.username,
      email: initialGithub.email ?? null,
      color: "text-slate-700",
      bgColor: "bg-slate-700/10",
    },
    {
      id: "trello",
      label: "Trello",
      description: "Manage projects and tasks",
      icon: "Trello",
      connected: initialTrello.connected,
      username: initialTrello.username,
      color: "text-blue-600",
      bgColor: "bg-blue-600/10",
    },
  ]);

  // OAuth callbacks, via useSearchParams instead of raw window.location.
  useEffect(() => {
    // GitHub: ?github=connected
    if (searchParams.get("github") === "connected") {
      setIntegrations((prev) =>
        prev.map((int) => (int.id === "github" ? { ...int, connected: true } : int))
      );
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Trello: ?trello=connect + token in hash fragment
    if (searchParams.get("trello") === "connect" && window.location.hash) {
      const tokenMatch = window.location.hash.match(/token=([^&]+)/);
      if (tokenMatch) {
        const token = tokenMatch[1];
        fetch("/api/integrations/trello/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
          .then((res) => {
            if (res.ok) {
              setIntegrations((prev) =>
                prev.map((int) => (int.id === "trello" ? { ...int, connected: true } : int))
              );
            }
          })
          .catch((error) => console.error("Error connecting Trello:", error))
          .finally(() => {
            window.history.replaceState({}, "", window.location.pathname);
          });
      }
    }
  }, [searchParams]);

  const onConnect = (integrationId: string) => {
    if (integrationId === "github") {
      window.location.assign("/api/integrations/github/auth");
    } else if (integrationId === "trello") {
      window.location.assign("/api/integrations/trello/auth");
    }
  };

  const onDisconnect = async (integrationId: string) => {
    if (integrationId === "github") {
      try {
        const response = await fetch("/api/integrations/github/disconnect", { method: "POST" });
        if (response.ok) {
          setIntegrations((prev) =>
            prev.map((int) =>
              int.id === "github" ? { ...int, connected: false, username: null, email: null } : int
            )
          );
        }
      } catch (error) {
        console.error("Failed to disconnect GitHub:", error);
      }
    }
  };

  return (
    <>
      <Card className="p-4 border-black/5">
        <h3 className="text-lg font-medium mb-2">Other Integrations</h3>
        <p className="text-sm text-muted-foreground mb-4">Connect additional services to enhance your workflow</p>
        <div className="grid gap-4">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:shadow-sm transition"
            >
              <div className="flex items-center gap-x-4">
                <div className={cn("p-2 w-fit rounded-md", integration.bgColor)}>
                  <BrandIcon
                    name={integration.icon}
                    className={cn("w-6 h-6", integration.color)}
                    size={24}
                  />
                </div>
                <div>
                  <p className="font-semibold text-sm">{integration.label}</p>
                  <p className="text-muted-foreground text-xs">{integration.description}</p>
                  {integration.id === "github" && integration.connected && (
                    <p className="text-xs text-muted-foreground mt-2 max-w-lg">
                      Connected as <strong>{integration.username}</strong> {integration.email ? `(${integration.email})` : ''}.
                      <br /><span className="italic">Your GitHub account may use a different email address than your Lattice login. The connection is explicitly authorized by you.</span>
                    </p>
                  )}
                </div>
              </div>

              <div>
                {integration.connected ? (
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-x-2 bg-green-500/10 text-green-500 px-3 py-1 rounded-full text-xs font-bold">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Connected
                    </div>
                    <div className="flex items-center gap-2">
                      {integration.id === "github" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRepoSelectorOpen(true)}>
                          Manage Repos
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-destructive h-7 text-xs" onClick={() => onDisconnect(integration.id)}>
                        Disconnect
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => onConnect(integration.id)}>
                    Connect
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <RepoSelectorModal isOpen={repoSelectorOpen} onOpenChange={setRepoSelectorOpen} />
    </>
  );
}

export function IntegrationsSection(props: Props) {
  return (
    <Suspense fallback={
      <Card className="p-4 border-black/5 animate-pulse">
        <div className="h-5 w-40 rounded bg-slate-200 dark:bg-white/10 mb-2" />
        <div className="h-4 w-64 rounded bg-slate-200 dark:bg-white/5 mb-4" />
        <div className="h-16 rounded-lg bg-slate-200 dark:bg-white/5" />
      </Card>
    }>
      <IntegrationsInner {...props} />
    </Suspense>
  );
}
