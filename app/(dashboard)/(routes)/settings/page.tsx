"use client";

import { useState, useEffect, Suspense } from "react";
import { Heading } from "@/components/heading";
import { Github, Slack, Trello, Brain, AlertCircle, CheckCircle2, Trash2, RotateCw, Settings, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import SlackIntegration from "@/components/slack-integration";

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

interface Fact {
  id: string;
  type: string;
  content: string;
  confidence: number;
  scope: string;
  extractedAt: number;
  expiresAt?: number;
  daysUntilExpiry?: number;
}

interface FactAnalytics {
  totalFacts: number;
  factsByType: Record<string, number>;
  factsByScope: Record<string, number>;
  averageConfidence: number;
  oldestFactDate: number | null;
  newestFactDate: number | null;
  expiringFactsCount: number;
  facts: Fact[];
}

const SettingsPage = () => {
  const { userId } = useAuth();
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

  const [analytics, setAnalytics] = useState<FactAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingFact, setDeletingFact] = useState<string | null>(null);
  const [extendingFact, setExtendingFact] = useState<string | null>(null);

  // Fetch memory analytics
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!userId) return;

      try {
        const response = await fetch("/api/memory/analytics", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          setAnalytics(data);
        }
      } catch (error) {
        console.error("Error fetching memory analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [userId]);

  const onConnect = (integrationId: string) => {
    console.log(`Connecting to ${integrationId}...`);
  };

  const handleDeleteFact = async (factId: string) => {
    try {
      setDeletingFact(factId);
      const response = await fetch("/api/memory/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ factId }),
      });

      if (response.ok) {
        // Refresh analytics
        setAnalytics((prev) =>
          prev
            ? {
                ...prev,
                facts: prev.facts.filter((f) => f.id !== factId),
                totalFacts: prev.totalFacts - 1,
              }
            : null
        );
      }
    } catch (error) {
      console.error("Error deleting fact:", error);
    } finally {
      setDeletingFact(null);
    }
  };

  const handleExtendFact = async (factId: string) => {
    try {
      setExtendingFact(factId);
      const response = await fetch("/api/memory/extend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ factId, extendDays: 90 }),
      });

      if (response.ok) {
        // Refresh analytics
        const data = await response.json();
        setAnalytics((prev) =>
          prev
            ? {
                ...prev,
                facts: prev.facts.map((f) =>
                  f.id === factId
                    ? {
                        ...f,
                        expiresAt: data.newExpiresAt,
                        daysUntilExpiry: Math.ceil(
                          (data.newExpiresAt - Date.now()) / (24 * 60 * 60 * 1000)
                        ),
                      }
                    : f
                ),
              }
            : null
        );
      }
    } catch (error) {
      console.error("Error extending fact:", error);
    } finally {
      setExtendingFact(null);
    }
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, any> = {
      decision: CheckCircle2,
      action_item: CheckCircle2,
      blocker: AlertCircle,
      project: Brain,
      verification: CheckCircle2,
    };
    return icons[type] || CheckCircle2;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      decision: "text-blue-600 bg-blue-600/10",
      action_item: "text-green-600 bg-green-600/10",
      blocker: "text-red-600 bg-red-600/10",
      project: "text-purple-600 bg-purple-600/10",
      verification: "text-emerald-600 bg-emerald-600/10",
    };
    return colors[type] || "text-gray-600 bg-gray-600/10";
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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

        {/* Memory Bank Section */}
        {analytics && (
          <Card className="p-6 border-black/5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-semibold">Your Memory Bank</h3>
            </div>

            {/* Memory Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Total Memories</p>
                <p className="text-2xl font-bold text-purple-600">
                  {analytics.totalFacts}
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Avg. Confidence</p>
                <p className="text-2xl font-bold text-blue-600">
                  {(analytics.averageConfidence * 100).toFixed(0)}%
                </p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Expiring Soon</p>
                <p className="text-2xl font-bold text-orange-600">
                  {analytics.expiringFactsCount}
                </p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Permanent</p>
                <p className="text-2xl font-bold text-green-600">
                  {analytics.factsByScope.user || 0}
                </p>
              </div>
            </div>

            {/* Facts List */}
            {analytics.facts.length > 0 ? (
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-gray-700">Stored Memories</h4>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {analytics.facts.map((fact) => {
                    const Icon = getTypeIcon(fact.type);
                    const isExpiring =
                      fact.daysUntilExpiry !== undefined && fact.daysUntilExpiry <= 7;
                    const isPermanent = !fact.expiresAt;

                    return (
                      <div
                        key={fact.id}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border transition",
                          isExpiring ? "border-orange-200 bg-orange-50" : "border-gray-200"
                        )}
                      >
                        <Icon className={cn("w-4 h-4 mt-1 flex-shrink-0", getTypeColor(fact.type))} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-900 line-clamp-2">
                                {fact.content}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                                  {fact.type.replace("_", " ")}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {(fact.confidence * 100).toFixed(0)}% confident
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Expiration Info */}
                          {isPermanent ? (
                            <p className="text-xs text-green-600 mt-2 font-medium">
                              ✓ Permanent Memory
                            </p>
                          ) : isExpiring ? (
                            <p className="text-xs text-orange-600 mt-2 font-medium">
                              ⚠ Expires in {fact.daysUntilExpiry} days
                            </p>
                          ) : (
                            <p className="text-xs text-gray-500 mt-2">
                              Expires in {fact.daysUntilExpiry} days
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!isPermanent && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleExtendFact(fact.id)}
                              disabled={extendingFact === fact.id}
                              className="h-8 w-8 p-0"
                              title="Keep this memory for 90 more days"
                            >
                              <RotateCw
                                className={cn(
                                  "w-4 h-4",
                                  extendingFact === fact.id && "animate-spin"
                                )}
                              />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteFact(fact.id)}
                            disabled={deletingFact === fact.id}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete this memory"
                          >
                            <Trash2
                              className={cn(
                                "w-4 h-4",
                                deletingFact === fact.id && "opacity-50"
                              )}
                            />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Brain className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No memories stored yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Chat with Genie to start building your personal memory bank.
                </p>
              </div>
            )}
          </Card>
        )}

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