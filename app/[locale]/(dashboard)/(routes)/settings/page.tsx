"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/components/heading";
import { Github, Slack, Trello, Archive, Settings, Loader2, Database, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import SlackIntegration from "@/components/slack-integration";
import { ConversationHistory } from "@/components/conversation-history";

// Loading fallback for Slack integration
function SlackIntegrationSkeleton() {
  return (
    <Card className="p-6 border-black/5">
      <div className="flex items-center gap-3">
        <div className="animate-pulse bg-gray-200 rounded-lg w-10 h-10" />
        <div className="space-y-2 flex-1">
          <div className="animate-pulse bg-gray-200 rounded h-4 w-32" />
          <div className="animate-pulse bg-gray-200 rounded h-3 w-48" />
        </div>
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    </Card>
  );
}

// Define the Integration interface
interface Integration {
  id: string;
  label: string;
  icon: any;
  description: string;
  connected: boolean;
  color: string;
  bgColor: string;
}

const SettingsPage = () => {
  const router = useRouter();
  const { userId } = useAuth();
  const [dailyDigestEnabled, setDailyDigestEnabled] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    async function fetchSettings() {
      if (!userId) return;
      try {
        const response = await fetch('/api/settings/digest');
        if (response.ok) {
          const data = await response.json();
          setDailyDigestEnabled(data.enabled ?? false);
        }
      } catch (err) {
        console.error("Error fetching user settings:", err);
      } finally {
        setLoadingSettings(false);
      }
    }
    fetchSettings();
  }, [userId]);

  const handleDigestToggle = async (enabled: boolean) => {
    const previousValue = dailyDigestEnabled;
    setDailyDigestEnabled(enabled); // Optimistic update

    try {
      const response = await fetch('/api/settings/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update settings');
      }
    } catch (err) {
      console.error("Error updating user settings:", err);
      setDailyDigestEnabled(previousValue); // Revert to actual previous value
    }
  };

  // Other integrations (Slack is handled separately above)
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "github",
      label: "GitHub",
      description: "Sync with your repositories",
      icon: Github,
      connected: false,
      color: "text-slate-700",
      bgColor: "bg-slate-700/10",
    },
    {
      id: "trello",
      label: "Trello",
      description: "Manage projects and tasks",
      icon: Trello,
      connected: false,
      color: "text-blue-600",
      bgColor: "bg-blue-600/10",
    },
  ]);

  const [checkingStatus, setCheckingStatus] = useState(true);

  // Fetch integration status on mount
  useEffect(() => {
    const checkIntegrationStatus = async () => {
      if (!userId) return;

      try {
        const [githubRes, trelloRes] = await Promise.all([
          fetch("/api/integrations/github/status"),
          fetch("/api/integrations/trello/status"),
        ]);

        if (githubRes.ok) {
          const githubData = await githubRes.json();
          setIntegrations((prev) =>
            prev.map((int) =>
              int.id === "github" ? { ...int, connected: githubData.connected } : int
            )
          );
        }

        if (trelloRes.ok) {
          const trelloData = await trelloRes.json();
          setIntegrations((prev) =>
            prev.map((int) =>
              int.id === "trello" ? { ...int, connected: trelloData.connected } : int
            )
          );
        }
      } catch (error) {
        console.error("Error checking integration status:", error);
      } finally {
        setCheckingStatus(false);
      }
    };

    checkIntegrationStatus();
  }, [userId]);

  // Handle OAuth callbacks
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = window.location.hash;

      // Handle GitHub callback
      if (params.get("github") === "connected") {
        setIntegrations((prev) =>
          prev.map((int) =>
            int.id === "github" ? { ...int, connected: true } : int
          )
        );
        // Clean up URL
        window.history.replaceState({}, "", "/settings");
      }

      // Handle Trello callback
      if (params.get("trello") === "connect" && hash) {
        const tokenMatch = hash.match(/token=([^&]+)/);
        if (tokenMatch) {
          const token = tokenMatch[1];
          try {
            const response = await fetch("/api/integrations/trello/connect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
            });

            if (response.ok) {
              setIntegrations((prev) =>
                prev.map((int) =>
                  int.id === "trello" ? { ...int, connected: true } : int
                )
              );
            }
          } catch (error) {
            console.error("Error connecting Trello:", error);
          }
          // Clean up URL
          window.history.replaceState({}, "", "/settings");
        }
      }
    };

    handleOAuthCallback();
  }, []);

  const onConnect = (integrationId: string) => {
    // Redirect to OAuth flow
    if (integrationId === "github") {
      window.location.href = "/api/integrations/github/auth";
    } else if (integrationId === "trello") {
      window.location.href = "/api/integrations/trello/auth";
    }
  };

  return (
    <div>
      <Heading
        title="Settings"
        description="Manage your account settings, integrations, and memories."
        icon={Settings}
        iconColor="text-gray-700"
        bgColor="bg-gray-700/10"
      />

      <div className="px-4 lg:px-8 space-y-6">
        {/* Slack Integration Section */}
        {userId && (
          <Suspense fallback={<SlackIntegrationSkeleton />}>
            <SlackIntegration userId={userId} />
          </Suspense>
        )}

        {/* Vault - Conversation History Access */}
        <Card className="p-6 border-black/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-600/10">
                <Archive className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Vault</h3>
                <p className="text-sm text-muted-foreground">
                  Access all your conversations, archives, and deleted items
                </p>
              </div>
            </div>
            <Button
              onClick={() => router.push('/settings/vault')}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Open Vault
            </Button>
          </div>
        </Card>

        {/* Data & Memory - Import/Export */}
        <Card className="p-6 border-black/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-700/10">
                <Database className="w-6 h-6 text-pink-700" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Data & Memory</h3>
                <p className="text-sm text-muted-foreground">
                  Import chat history, manage memory bank, and export your data
                </p>
              </div>
            </div>
            <Button
              onClick={() => router.push('/settings/data')}
              className="bg-pink-700 hover:bg-pink-800"
            >
              Manage Data
            </Button>
          </div>
        </Card>

        {/* Daily Briefing Section */}
        <Card className="p-6 border-black/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10">
                <Mail className="w-6 h-6 text-indigo-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Daily Briefing</h3>
                <p className="text-sm text-muted-foreground">
                  Receive a daily email summary of your key insights and action items
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={dailyDigestEnabled}
                onCheckedChange={handleDigestToggle}
                disabled={loadingSettings}
              />
              <span className="text-sm font-medium text-muted-foreground">
                {dailyDigestEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </Card>

        {/* Other Integrations Card Section */}
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
                  <div
                    className={cn("p-2 w-fit rounded-md", integration.bgColor)}
                  >
                    <integration.icon
                      className={cn("w-6 h-6", integration.color)}
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{integration.label}</p>
                    <p className="text-muted-foreground text-xs">
                      {integration.description}
                    </p>
                  </div>
                </div>

                <div>
                  {integration.connected ? (
                    <div className="flex items-center gap-x-2 bg-green-500/10 text-green-500 px-3 py-1 rounded-full text-xs font-bold">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Connected
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onConnect(integration.id)}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;