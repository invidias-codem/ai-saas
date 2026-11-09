"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
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
  hasStoredCredential?: boolean;
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
  const [githubChecking, setGithubChecking] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubStatus, setGithubStatus] = useState(
    initialGithub.hasStoredCredential || initialGithub.connected ? "unverified" : "not_connected"
  );
  const [integrations, setIntegrations] = useState<IntegrationState[]>([
    {
      id: "github",
      label: "GitHub",
      description: "Sync with your repositories",
      icon: "Github",
      // Presence of a stored OAuth token does NOT prove GitHub still permits
      // access. The status API performs a live provider verification.
      connected: false,
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

  const refreshGitHub = useCallback(async () => {
    setGithubChecking(true);
    setGithubError(null);
    try {
      const response = await fetch("/api/integrations/github/status", { cache: "no-store" });
      if (!response.ok) throw new Error("GitHub status unavailable");
      const status = await response.json() as {
        status?: string; connected?: boolean; username?: string | null; email?: string | null;
      };
      const verified = status.status === "connected_verified" && status.connected === true;
      setGithubStatus(status.status ?? "unknown");
      setIntegrations((prev) => prev.map((entry) => entry.id === "github"
        ? {
            ...entry,
            connected: verified,
            username: status.username ?? entry.username,
            email: status.email ?? entry.email,
          }
        : entry
      ));
    } catch {
      setGithubStatus("unknown");
      setGithubError("We couldn't verify GitHub right now. Try again or reconnect.");
    } finally {
      setGithubChecking(false);
    }
  }, []);

  // On load and after the OAuth callback, verify the saved credential rather
  // than unconditionally painting the GitHub card green.
  useEffect(() => {
    void refreshGitHub();
  }, [refreshGitHub]);

  // OAuth callbacks, via useSearchParams instead of raw window.location.
  useEffect(() => {
    // Success is already verified against GitHub by refreshGitHub.
    // Report denial / error outcomes without echoing provider diagnostics.
    const result = searchParams.get("github");
    if (result === "error") {
      const reason = searchParams.get("reason");
      const errors: Record<string, string> = {
        denied: "GitHub authorization was canceled.",
        provider: "GitHub could not authorize this connection. Please try again.",
        missing_code: "GitHub did not return an authorization code.",
        connection_failed: "Lattice couldn't save the GitHub connection. Please retry.",
      };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGithubError(errors[reason ?? ""] ?? "GitHub authorization failed.");
    }
    if (result === "connected" || result === "error") {
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
        if (!response.ok) throw new Error("GitHub disconnect request failed");
        setIntegrations((prev) =>
          prev.map((int) =>
            int.id === "github" ? { ...int, connected: false, username: null, email: null } : int
          )
        );
        setGithubStatus("not_connected");
        setGithubError(null);
      } catch (error) {
        console.error("Failed to disconnect GitHub:", error);
        setGithubError("GitHub couldn't be disconnected. Please try again.");
      }
    }
  };

  return (
    <>
      <Card className="w-full max-w-full min-w-0 overflow-hidden p-3 sm:p-4 border-black/5">
        <h3 className="text-lg font-medium mb-2">Other Integrations</h3>
        <p className="text-sm text-muted-foreground mb-4">Connect additional services to enhance your workflow</p>
        <div className="grid min-w-0 gap-4">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg hover:shadow-sm transition"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
                <div className={cn("p-2 w-fit shrink-0 rounded-md", integration.bgColor)}>
                  <BrandIcon
                    name={integration.icon}
                    className={cn("w-6 h-6", integration.color)}
                    size={24}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">{integration.label}</p>
                  <p className="text-muted-foreground text-xs break-words">{integration.description}</p>
                  {integration.id === "github" && (
                    <p role="status" className="mt-2 text-xs text-muted-foreground break-words">
                      {githubChecking ? "Checking GitHub connection…" :
                        githubStatus === "connected_verified" ? "Verified with GitHub" :
                        githubStatus === "expired_reconnect_required" ? "Authorization expired. Reconnect GitHub." :
                        githubStatus === "access_denied" ? "GitHub denied access. Reconnect or update permissions." :
                        githubStatus === "provider_unavailable" || githubStatus === "unknown" ? "GitHub status unavailable. Retry verification." :
                        githubStatus === "unverified" ? "Stored credential not yet verified" : "GitHub is not connected"}
                    </p>
                  )}
                  {integration.id === "github" && integration.connected && (
                    <p className="text-xs text-muted-foreground mt-2 max-w-lg break-all">
                      Connected as <strong>{integration.username}</strong> {integration.email ? `(${integration.email})` : ''}.
                      <br /><span className="italic">Your GitHub account may use a different email address than your Lattice login. The connection is explicitly authorized by you.</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex w-full min-w-0 shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
                {integration.connected ? (
                  <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
                    <div className="flex items-center gap-x-2 bg-green-500/10 text-green-500 px-3 py-1 rounded-full text-xs font-bold">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Connected
                    </div>
                    <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
                      {integration.id === "github" && (
                        <Button variant="outline" size="sm" className="h-9 min-w-0 flex-1 text-xs sm:h-7 sm:flex-none" onClick={() => setRepoSelectorOpen(true)}>
                          Manage Repos
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-destructive h-9 min-w-0 flex-1 text-xs sm:h-7 sm:flex-none" onClick={() => onDisconnect(integration.id)}>
                        Disconnect
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto">
                    {integration.id === "github" && (githubStatus === "unknown" || githubStatus === "provider_unavailable") && (
                      <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={githubChecking}
                        onClick={() => void refreshGitHub()}>
                        {githubChecking ? "Checking…" : "Retry status"}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="min-w-0 flex-1 sm:flex-none"
                      disabled={integration.id === "github" && githubChecking}
                      onClick={() => onConnect(integration.id)}>
                      {integration.id === "github"
                        ? (githubStatus === "not_connected" ? "Connect GitHub" : "Reconnect GitHub")
                        : "Connect Trello"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {githubError && (
          <p role="alert" className="mt-3 break-words rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {githubError}
          </p>
        )}
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
