"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Slack,
  CheckCircle2,
  XCircle,
  ExternalLink,
  MessageSquare,
  Hash,
  Bot,
  Zap,
  RefreshCw,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SlackConfig {
  connected: boolean;
  workspaceName?: string;
  workspaceId?: string;
  channelId?: string;
  channelName?: string;
  botUserId?: string;
  botName?: string;
  notificationsEnabled?: boolean;
  lastSync?: string;
  error?: string;
}

interface SlackIntegrationProps {
  userId: string;
}

export function SlackIntegration({ userId }: SlackIntegrationProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [config, setConfig] = useState<SlackConfig>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check URL params for OAuth callback results
  useEffect(() => {
    const slackSuccess = searchParams.get('slack_success');
    const slackError = searchParams.get('slack_error');
    const slackTeam = searchParams.get('slack_team');

    if (slackSuccess === 'true') {
      setSuccessMessage(`🎉 Successfully connected to ${slackTeam || 'your Slack workspace'}! You can now use Genie in Slack.`);
      // Clear URL params after showing message
      const timeout = setTimeout(() => {
        router.replace('/settings', { scroll: false });
      }, 100);
      return () => clearTimeout(timeout);
    }

    if (slackError) {
      const errorMessages: Record<string, string> = {
        'access_denied': 'You cancelled the Slack authorization. Click "Connect to Slack" to try again.',
        'invalid_state': 'Security validation failed. Please try connecting again.',
        'state_expired': 'The connection request expired. Please try again.',
        'missing_parameters': 'Something went wrong. Please try connecting again.',
        'token_exchange_failed': 'Failed to complete the connection. Please try again.',
        'callback_failed': 'Connection failed. Please try again.',
      };
      setErrorMessage(errorMessages[slackError] || `Connection error: ${slackError}`);
      // Clear URL params
      const timeout = setTimeout(() => {
        router.replace('/settings', { scroll: false });
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [searchParams, router]);

  // Fetch current Slack configuration
  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/integrations/slack/status");
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (error) {
      console.error("Error fetching Slack config:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Clear messages after delay
  useEffect(() => {
    if (successMessage) {
      const timeout = setTimeout(() => setSuccessMessage(null), 8000);
      return () => clearTimeout(timeout);
    }
  }, [successMessage]);

  useEffect(() => {
    if (errorMessage) {
      const timeout = setTimeout(() => setErrorMessage(null), 10000);
      return () => clearTimeout(timeout);
    }
  }, [errorMessage]);

  const handleConnect = () => {
    setConnecting(true);
    setErrorMessage(null);
    
    // Use environment variable for production URL, or current origin
    let origin = window.location.origin;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    
    if (appUrl) {
      origin = appUrl;
    } else if (origin.startsWith('http://localhost')) {
      setConnecting(false);
      setErrorMessage(
        'Development mode: Please set NEXT_PUBLIC_APP_URL to your ngrok URL to test Slack OAuth.'
      );
      return;
    }
    
    const redirectUri = `${origin}/api/integrations/slack/callback`;
    window.location.href = `/api/integrations/slack/auth?redirect_uri=${encodeURIComponent(redirectUri)}`;
  };

  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setShowDisconnectConfirm(false);
    setDisconnecting(true);
    setErrorMessage(null);
    
    try {
      const response = await fetch("/api/integrations/slack/disconnect", {
        method: "POST",
      });
      
      const data = await response.json();
      
      if (data.success) {
        setConfig({ connected: false });
        setSuccessMessage(data.message || 'Successfully disconnected from Slack.');
        
        // Show warning if there's one
        if (data.warning) {
          setTimeout(() => {
            setErrorMessage(data.warning);
          }, 3000);
        }
      } else {
        setErrorMessage(data.error || 'Failed to disconnect from Slack. Please try again.');
      }
    } catch (error) {
      console.error("Error disconnecting Slack:", error);
      setErrorMessage('Network error. Please check your connection and try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTestingConnection(true);
      const response = await fetch("/api/integrations/slack/test", {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        setSuccessMessage('✅ Test message sent! Check your Slack workspace.');
      } else {
        setErrorMessage(`Test failed: ${data.error}`);
      }
    } catch (error) {
      console.error("Error testing connection:", error);
      setErrorMessage('Failed to send test message. Please try again.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRefresh = () => {
    fetchConfig();
  };

  // Loading state
  if (loading) {
    return (
      <Card className="p-6 border-black/5">
        <div className="flex items-center gap-3">
          <div className="animate-pulse bg-purple-100 rounded-lg w-12 h-12" />
          <div className="space-y-2 flex-1">
            <div className="animate-pulse bg-gray-200 rounded h-5 w-40" />
            <div className="animate-pulse bg-gray-200 rounded h-4 w-56" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-black/5 overflow-hidden">
      {/* Success Message */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-green-800 font-medium">{successMessage}</p>
          </div>
          <button 
            onClick={() => setSuccessMessage(null)}
            className="text-green-600 hover:text-green-800"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 animate-in slide-in-from-top-2">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800">{errorMessage}</p>
          </div>
          <button 
            onClick={() => setErrorMessage(null)}
            className="text-red-600 hover:text-red-800"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-3 rounded-xl",
            config.connected ? "bg-green-100" : "bg-[#4A154B]/10"
          )}>
            <Slack className={cn(
              "w-6 h-6",
              config.connected ? "text-green-600" : "text-[#4A154B]"
            )} />
          </div>
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              Slack Integration
              {config.connected && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  Active
                </span>
              )}
            </h3>
            <p className="text-sm text-muted-foreground">
              {config.connected 
                ? `Connected to ${config.workspaceName || 'your workspace'}`
                : 'Connect Slack to chat with Genie in your workspace'
              }
            </p>
          </div>
        </div>
        
        {config.connected && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="text-gray-400 hover:text-gray-600"
            title="Refresh status"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>

      {config.connected ? (
        /* ===== CONNECTED STATE ===== */
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <MessageSquare className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <p className="text-xs text-gray-600">Direct Messages</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg text-center">
              <Bot className="w-5 h-5 text-purple-600 mx-auto mb-1" />
              <p className="text-xs text-gray-600">@Mentions</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg text-center">
              <Zap className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
              <p className="text-xs text-gray-600">Slash Commands</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <Sparkles className="w-5 h-5 text-green-600 mx-auto mb-1" />
              <p className="text-xs text-gray-600">AI Responses</p>
            </div>
          </div>

          {/* How to Use */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-gray-500" />
              How to use Genie in Slack
            </h4>
            <div className="space-y-2 text-sm text-gray-600">
              <p>• Type <code className="bg-white px-1.5 py-0.5 rounded text-purple-600 font-mono text-xs">/genie help</code> to see all commands</p>
              <p>• Type <code className="bg-white px-1.5 py-0.5 rounded text-purple-600 font-mono text-xs">/genie ask [question]</code> to ask anything</p>
              <p>• Mention <code className="bg-white px-1.5 py-0.5 rounded text-purple-600 font-mono text-xs">@Genie</code> in any channel for help</p>
              <p>• Send a direct message to Genie for private conversations</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testingConnection || disconnecting}
              className="flex-1 sm:flex-none"
            >
              {testingConnection ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Send Test Message
                </>
              )}
            </Button>
            
            {showDisconnectConfirm ? (
              <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
                <span className="text-sm text-red-700">Disconnect from Slack?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="h-7 px-3"
                >
                  {disconnecting ? (
                    <>
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                      Disconnecting...
                    </>
                  ) : (
                    'Yes, Disconnect'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowDisconnectConfirm(false)}
                  disabled={disconnecting}
                  className="h-7 px-3"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setShowDisconnectConfirm(true)}
                disabled={disconnecting}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Disconnect
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* ===== NOT CONNECTED STATE ===== */
        <div className="space-y-6">
          {/* Benefits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-sm">Chat Anywhere</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ask Genie questions directly in Slack channels or DMs
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Zap className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-sm">Quick Commands</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use /genie for instant help with code, explanations, and more
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <div className="p-2 bg-green-100 rounded-lg">
                <Bot className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-sm">Team Collaboration</p>
                <p className="text-xs text-muted-foreground mt-1">
                  @mention Genie in any channel to get AI assistance
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Sparkles className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="font-medium text-sm">Smart Responses</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Get contextual AI responses formatted for Slack
                </p>
              </div>
            </div>
          </div>

          {/* Connect Button */}
          <div className="pt-4 border-t">
            <Button 
              onClick={handleConnect} 
              disabled={connecting} 
              className="w-full bg-[#4A154B] hover:bg-[#3a1039] text-white"
              size="lg"
            >
              {connecting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Slack className="w-5 h-5 mr-2" />
                  Connect to Slack
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-3">
              You&apos;ll be redirected to Slack to authorize the connection
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

export default SlackIntegration;
