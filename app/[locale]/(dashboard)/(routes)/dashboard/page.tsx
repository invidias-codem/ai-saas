"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRightIcon, ChatBubbleIcon, CodeIcon, DiscIcon, ImageIcon, VideoIcon } from "@radix-ui/react-icons";
import { Brain, TrendingUp, Zap, Sparkles, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { DashboardSupport } from "@/components/dashboard-support";
import { DataImportWizard } from "@/components/DataImportWizard";

const tools = [
  {
    label: "Conversation",
    icon: ChatBubbleIcon,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20",
    shadowColor: "shadow-violet-500/10",
    href: "/conversation",
    cols: "md:col-span-2",
    description: "Chat with AI"
  },
  {
    label: "Image Capsule",
    icon: ImageIcon,
    href: "/image",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    shadowColor: "shadow-purple-500/10",
    cols: "md:col-span-1",
    description: "Generate images"
  },
  {
    label: "Quick Clip",
    icon: VideoIcon,
    href: "/video",
    color: "text-pink-700",
    bgColor: "bg-pink-700/10",
    borderColor: "border-pink-700/20",
    shadowColor: "shadow-pink-700/10",
    cols: "md:col-span-1",
    description: "Create videos"
  },
  {
    label: "Juke Box",
    icon: DiscIcon,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    shadowColor: "shadow-emerald-500/10",
    href: "/music",
    cols: "md:col-span-1",
    description: "Compose music"
  },
  {
    label: "Code",
    icon: CodeIcon,
    href: "/code",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
    shadowColor: "shadow-green-500/10",
    cols: "md:col-span-1",
    description: "Generate code"
  },
];

interface FactAnalytics {
  totalFacts: number;
  factsByType: Record<string, number>;
  factsByScope: Record<string, number>;
  averageConfidence: number;
  oldestFactDate: number | null;
  newestFactDate: number | null;
  expiringFactsCount: number;
  facts: any[];
}

const DashboardPage = () => {
  const router = useRouter();
  const t = useTranslations("Dashboard");
  
  const mapLabel = (label: string) => {
    switch (label) {
      case 'Conversation': return t('tools.conversation.label');
      case 'Image Capsule': return t('tools.image.label');
      case 'Quick Clip': return t('tools.video.label');
      case 'Juke Box': return t('tools.music.label');
      case 'Code': return t('tools.code.label');
      default: return label;
    }
  };
  
  const mapDesc = (desc: string) => {
    switch (desc) {
      case 'Chat with AI': return t('tools.conversation.description');
      case 'Generate images': return t('tools.image.description');
      case 'Create videos': return t('tools.video.description');
      case 'Compose music': return t('tools.music.description');
      case 'Generate code': return t('tools.code.description');
      default: return desc;
    }
  };
  const { userId } = useAuth();
  const [analytics, setAnalytics] = useState<FactAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImportWizard, setShowImportWizard] = useState(false);

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

  // Refresh analytics after a successful import
  const handleImportComplete = async () => {
    setShowImportWizard(false);
    try {
      const res = await fetch("/api/memory/analytics");
      if (res.ok) setAnalytics(await res.json());
    } catch { /* analytics refresh is best-effort */ }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative mb-12 px-4 md:px-20 lg:px-32">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-purple-500/5 to-pink-500/5 blur-3xl -z-10" />
        <div className="text-center space-y-4 py-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 mb-4">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
              AI-Powered Workspace
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
            Welcome to Genie
          </h1>
          <p className="text-muted-foreground font-light text-sm md:text-lg max-w-2xl mx-auto">
            Your all-in-one AI platform for creation, conversation, and innovation
          </p>
        </div>
      </div>

      <div className="px-4 md:px-20 lg:px-32 space-y-8">
        {/* Memory Stats Section */}
        {!loading && analytics && (
          <div className="relative rounded-3xl border border-purple-500/20 bg-gradient-to-br from-background via-background to-purple-500/5 backdrop-blur-xl p-6 shadow-2xl shadow-purple-500/10">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-transparent to-violet-500/5 rounded-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-500/20">
                    <Brain className="w-6 h-6 text-purple-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Memory Bank</h2>
                    <p className="text-sm text-muted-foreground">Your AI&apos;s knowledge about you</p>
                  </div>
                </div>
                <Button
                  onClick={() => setShowImportWizard(true)}
                  size="sm"
                  className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white shadow-lg shadow-purple-500/30 rounded-xl"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import Memories
                </Button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="group relative rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-violet-500/5 p-4 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-4 h-4 text-purple-500" />
                      <p className="text-xs text-muted-foreground font-medium">Total Memories</p>
                    </div>
                    <p className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
                      {analytics.totalFacts}
                    </p>
                  </div>
                </div>

                <div className="group relative rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 p-4 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                      <p className="text-xs text-muted-foreground font-medium">Confidence</p>
                    </div>
                    <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                      {(analytics.averageConfidence * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>

                <div className="group relative rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-amber-500/5 p-4 hover:shadow-lg hover:shadow-orange-500/20 transition-all duration-300">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-orange-500" />
                      <p className="text-xs text-muted-foreground font-medium">Expiring Soon</p>
                    </div>
                    <p className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                      {analytics.expiringFactsCount}
                    </p>
                  </div>
                </div>

                <div className="group relative rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/5 to-emerald-500/5 p-4 hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-green-500" />
                      <p className="text-xs text-muted-foreground font-medium">Permanent</p>
                    </div>
                    <p className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                      {analytics.factsByScope.user || 0}
                    </p>
                  </div>
                </div>
              </div>

              {analytics.totalFacts === 0 && (
                <div className="mt-6 text-center py-8 rounded-2xl border border-dashed border-purple-500/20 bg-purple-500/5">
                  <Brain className="w-12 h-12 mx-auto mb-3 text-purple-500/30" />
                  <p className="text-sm text-muted-foreground">No memories stored yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Chat with Genie to start building your personal memory bank.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Import Memories Wizard */}
        <Dialog open={showImportWizard} onOpenChange={setShowImportWizard}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-500" />
                Import Memories
              </DialogTitle>
            </DialogHeader>
            <DataImportWizard onComplete={handleImportComplete} />
          </DialogContent>
        </Dialog>

        {/* Support Narrative */}
        <DashboardSupport />

        {/* Tools Grid */}
        <div>
          <h2 className="text-xl font-bold mb-4 px-1">Quick Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {tools.map((tool) => (
              <Card
                onClick={() => router.push(tool.href)}
                key={tool.href}
                className={cn(
                  "group relative p-6 border cursor-pointer overflow-hidden transition-all duration-500 hover:scale-[1.02]",
                  tool.cols,
                  tool.borderColor,
                  "bg-gradient-to-br from-background to-background",
                  `hover:shadow-2xl hover:${tool.shadowColor}`
                )}
              >
                {/* Gradient Overlay */}
                <div className={cn(
                  "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                  tool.bgColor
                )} />

                {/* Content */}
                <div className="relative z-10 flex flex-col h-full justify-between">
                  {/* Header */}
                  <div className="flex items-start justify-between w-full mb-4">
                    <div className={cn(
                      "p-3 rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3",
                      tool.bgColor
                    )}>
                      <tool.icon className={cn("w-7 h-7", tool.color)} />
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                      <ArrowRightIcon className={cn("w-5 h-5", tool.color)} />
                    </div>
                  </div>

                  {/* Footer */}
                  <div>
                    <h3 className="font-bold text-lg mb-1">{mapLabel(tool.label)}</h3>
                    <p className="text-xs text-muted-foreground">{mapDesc(tool.description)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
