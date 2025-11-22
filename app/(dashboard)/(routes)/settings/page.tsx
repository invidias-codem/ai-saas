"use client";

import { useState } from "react";
import { Heading } from "@/components/heading";
import { GearIcon } from "@radix-ui/react-icons";
import { Github, Slack, Trello } from "lucide-react"; // Using lucide-react for integration icons
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  // Mock state for integrations. 
  // In a real application, fetch this data from your backend (e.g., database check for existing integration documents).
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "slack",
      label: "Slack",
      description: "Connect to your Slack workspace",
      icon: Slack,
      connected: false,
      color: "text-pink-700", // Slack-like color or generic
      bgColor: "bg-pink-700/10",
    },
    {
      id: "github",
      label: "GitHub",
      description: "Sync with your repositories",
      icon: Github,
      connected: true, // Simulating a connected state for demonstration
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

  const onConnect = (integrationId: string) => {
    // Add your connection logic here (e.g., OAuth redirect)
    console.log(`Connecting to ${integrationId}...`);
  };

  return (
    <div>
      <Heading
        title="Settings"
        description="Manage your account settings and integrations."
        icon={GearIcon}
        iconColor="text-gray-700"
        bgColor="bg-gray-700/10"
      />
      
      <div className="px-4 lg:px-8 space-y-4">
        {/* Integrations Card Section */}
        <Card className="p-4 border-black/5">
            <h3 className="text-lg font-medium mb-4">Integrations</h3>
            <div className="grid gap-4">
              {integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:shadow-sm transition"
                >
                  <div className="flex items-center gap-x-4">
                    <div className={cn("p-2 w-fit rounded-md", integration.bgColor)}>
                      <integration.icon className={cn("w-6 h-6", integration.color)} />
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