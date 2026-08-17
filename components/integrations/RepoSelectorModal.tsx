"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2 } from "lucide-react";

interface Repo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  pushed_at: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface RepoSelectorModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const RepoSelectorModal = ({ isOpen, onOpenChange }: RepoSelectorModalProps) => {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [allowedRepos, setAllowedRepos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  async function fetchWorkspaces() {
    try {
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data = await res.json();
        const wks = data.workspaces || [];
        setWorkspaces(wks);
        if (wks.length > 0 && !selectedWorkspaceId) {
          setSelectedWorkspaceId(wks[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch workspaces", err);
    }
  }

  async function fetchRepos() {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/github/repos");
      if (res.ok) {
        const data = await res.json();
        setRepos(data.repos || []);
      }
    } catch (err) {
      console.error("Failed to fetch repos", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllowedRepos(workspaceId: string) {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/repos`);
      if (res.ok) {
        const data = await res.json();
        setAllowedRepos(new Set(data.repos || []));
      }
    } catch (err) {
      console.error("Failed to fetch allowed repos", err);
    }
  }

  useEffect(() => {
    if (isOpen) {
      // Async data loads on open.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchRepos();
       
      fetchWorkspaces();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedWorkspaceId && isOpen) {
      // Async data load for the selected workspace.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAllowedRepos(selectedWorkspaceId);
    } else {
      // Reset repos when the modal closes or workspace changes.
       
      setAllowedRepos(new Set());
    }
  }, [selectedWorkspaceId, isOpen]);

  const toggleRepo = async (repoFullName: string, checked: boolean) => {
    if (!selectedWorkspaceId) return;
    setSaveError(null);
    setSaveSuccess(null);
    setSaving(true);
    try {
      if (checked) {
        const linkRes = await fetch(`/api/workspaces/${selectedWorkspaceId}/repos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo_full_name: repoFullName })
        });
        if (!linkRes.ok) {
          const text = await linkRes.text().catch(() => '');
          throw new Error(`Failed to link repo${text ? ': ' + text : ''}`);
        }
        setAllowedRepos(prev => new Set(prev).add(repoFullName));

        // Persist active selection when a new repo is linked.
        const patchRes = await fetch(`/api/workspaces/${selectedWorkspaceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active_github_repo: repoFullName })
        });
        if (!patchRes.ok) {
          const text = await patchRes.text().catch(() => '');
          throw new Error(`Failed to save active repo${text ? ': ' + text : ''}`);
        }
        setSaveSuccess(`Saved to workspace`);
      } else {
        const deleteRes = await fetch(`/api/workspaces/${selectedWorkspaceId}/repos?repo_full_name=${encodeURIComponent(repoFullName)}`, {
          method: "DELETE"
        });
        if (!deleteRes.ok) {
          const text = await deleteRes.text().catch(() => '');
          throw new Error(`Failed to unlink repo${text ? ': ' + text : ''}`);
        }
        setAllowedRepos(prev => {
          const next = new Set(prev);
          next.delete(repoFullName);
          return next;
        });
        setSaveSuccess(`Removed from workspace`);
      }
    } catch (err: any) {
      console.error("Failed to toggle repo", err);
      setSaveError(err?.message || "Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  };

  const filteredRepos = repos.filter(repo => 
    repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Repositories</DialogTitle>
          <DialogDescription>
            Lattice will only have read-access to the repositories you explicitly enable for the selected workspace.
          </DialogDescription>
        </DialogHeader>

        {workspaces.length > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Configure for:</span>
            <Select value={selectedWorkspaceId || ""} onValueChange={setSelectedWorkspaceId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {(saveError || saveSuccess) && (
          <div className="mt-3 text-xs">
            {saveError && <p className="text-destructive">{saveError}</p>}
            {saveSuccess && <p className="text-emerald-600">{saveSuccess}</p>}
          </div>
        )}

        <div className="relative mt-4 mb-4">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search repositories..." 
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            filteredRepos.map((repo) => (
              <div key={repo.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{repo.full_name}</span>
                    {repo.private && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border">
                        Private
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Last pushed: {new Date(repo.pushed_at).toLocaleDateString()}
                  </span>
                </div>
                <Switch 
                  disabled={!selectedWorkspaceId}
                  checked={allowedRepos.has(repo.full_name)}
                  onCheckedChange={(checked) => toggleRepo(repo.full_name, checked)}
                />
              </div>
            ))
          )}
          {!loading && filteredRepos.length === 0 && (
            <div className="text-center text-sm text-muted-foreground mt-8">
              No repositories found.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
