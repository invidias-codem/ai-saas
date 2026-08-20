"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { StickyActionBar, FormSection } from "@/components/ui/form-mobile";
import { Key, Plus, Copy, Trash2, CheckCircle, XCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface PartnerKey {
  id: string;
  workspace_id: string;
  name: string;
  key_prefix: string;
  environment: string;
  scopes: string[];
  rate_limit_per_min: number;
  revoked: boolean;
  last_used_at: string | null;
  created_at: string;
}

interface Workspace {
  id: string;
  name: string;
}

export default function PartnerKeysPage() {
  const t = useTranslations("Settings.PartnerKeys");
  const [keys, setKeys] = useState<PartnerKey[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWorkspace, setNewWorkspace] = useState("");
  const [newEnvironment, setNewEnvironment] = useState("test");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null); // shown once!
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [keyRes, wsRes] = await Promise.all([
          fetch('/api/settings/partner-keys'),
          fetch('/api/workspaces'),
        ]);
        if (keyRes.ok) {
          const data = await keyRes.json();
          setKeys(data.keys || []);
        }
        if (wsRes.ok) {
          const data = await wsRes.json();
          setWorkspaces(data.workspaces || []);
          if (data.workspaces?.[0]?.id) setNewWorkspace(data.workspaces[0].id);
        }
      } catch (err) {
        console.error('Error loading partner keys:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newWorkspace) return;
    setCreating(true);
    try {
      const res = await fetch('/api/settings/partner-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          workspaceId: newWorkspace,
          environment: newEnvironment,
          scopes: ['memory:write', 'memory:read', 'query:read', 'stream:read', 'webhooks:manage'],
          rateLimitPerMin: newEnvironment === 'live' ? 1000 : 100,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        // Reload keys list
        const keyRes = await fetch('/api/settings/partner-keys');
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          setKeys(keyData.keys || []);
        }
      }
    } catch (err) {
      console.error('Error creating key:', err);
    } finally {
      setCreating(false);
      setCreateOpen(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this key? It will immediately stop working.')) return;
    try {
      const res = await fetch(`/api/settings/partner-keys?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setKeys(keys.map(k => k.id === id ? { ...k, revoked: true } : k));
      }
    } catch (err) {
      console.error('Error revoking key:', err);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Key className="w-6 h-6 sm:w-8 sm:h-8" />
            Partner API Keys
          </h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            Create and manage API keys for integrating with Lattice OS.
          </p>
        </div>
        <Button onClick={() => { setCreateOpen(!createOpen); setNewKey(null); }} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Create Key
        </Button>
      </div>

      {/* Create form */}
      {createOpen && !newKey && (
        <Card className="p-4 sm:p-6 space-y-3 sm:space-y-4">
          <h2 className="text-lg font-semibold">Create New API Key</h2>

          <FormSection title="Key Name">
            <Input
              placeholder="e.g. Acme Production"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </FormSection>

          <FormSection title="Workspace">
            <select
              className="w-full border border-gray-300 rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700 h-11 sm:h-10"
              value={newWorkspace}
              onChange={(e) => setNewWorkspace(e.target.value)}
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </FormSection>

          <FormSection title="Environment">
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="env"
                  value="test"
                  checked={newEnvironment === 'test'}
                  onChange={(e) => setNewEnvironment(e.target.value)}
                />
                Test (100 req/min)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="env"
                  value="live"
                  checked={newEnvironment === 'live'}
                  onChange={(e) => setNewEnvironment(e.target.value)}
                />
                Live (1000 req/min)
              </label>
            </div>
          </FormSection>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => setCreateOpen(false)} variant="outline" className="flex-1 sm:flex-none">Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()} className="flex-1 sm:flex-none">
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Generate Key
            </Button>
          </div>
        </Card>
      )}

      {/* Show newly created key ONCE */}
      {newKey && (
        <Card className="p-6 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5" />
            <div className="flex-1">
              <h2 className="font-semibold text-green-900 dark:text-green-100">
                Key Created Successfully
              </h2>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                Copy this key now. <strong>It won&apos;t be shown again.</strong>
              </p>

              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 p-3 bg-white dark:bg-gray-900 rounded border border-green-300 dark:border-green-700 text-sm font-mono break-all">
                  {newKey}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleCopy(newKey)}
                >
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>

              <Button
                className="mt-4"
                variant="outline"
                onClick={() => setNewKey(null)}
              >
                I&apos;ve copied it, close this
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Existing keys list */}
      <div className="space-y-3">
        {keys.length === 0 ? (
          <Card className="p-6 sm:p-8 text-center text-gray-500">
            No partner keys yet. Create one to start integrating with Lattice OS.
          </Card>
        ) : (
          keys.map((key) => (
            <Card key={key.id} className={`p-3 sm:p-4 ${key.revoked ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Key className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="font-medium text-sm">{key.name}</span>
                    <Badge variant={key.environment === 'live' ? 'default' : 'secondary'}>
                      {key.environment}
                    </Badge>
                    {key.revoked && (
                      <Badge variant="destructive">Revoked</Badge>
                    )}
                  </div>
                  <code className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-mono block truncate">
                    {key.key_prefix}••••••••••••••••
                  </code>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                    <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                    <span>{key.rate_limit_per_min} req/min</span>
                    {key.last_used_at && (
                      <span>Last used {new Date(key.last_used_at).toLocaleDateString()}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {key.scopes.map((scope) => (
                      <Badge key={scope} variant="outline" className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
                {!key.revoked && (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleRevoke(key.id)}
                    className="shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
