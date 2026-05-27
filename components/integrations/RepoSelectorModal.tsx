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

  useEffect(() => {
    if (isOpen) {
      fetchRepos();
      fetchWorkspaces();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedWorkspaceId && isOpen) {
      fetchAllowedRepos(selectedWorkspaceId);
    } else {
      setAllowedRepos(new Set());
    }
  }, [selectedWorkspaceId, isOpen]);

  const fetchWorkspaces = async () => {
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
  };

  const fetchRepos = async () => {
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
  };

  const fetchAllowedRepos = async (workspaceId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/repos`);
      if (res.ok) {
        const data = await res.json();
        setAllowedRepos(new Set(data.repos || []));
      }
    } catch (err) {
      console.error("Failed to fetch allowed repos", err);
    }
  };

  const toggleRepo = async (repoFullName: string, checked: boolean) => {
    if (!selectedWorkspaceId) return;
    try {
      if (checked) {
        await fetch(`/api/workspaces/${selectedWorkspaceId}/repos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo_full_name: repoFullName })
        });
        setAllowedRepos(prev => new Set(prev).add(repoFullName));
      } else {
        await fetch(`/api/workspaces/${selectedWorkspaceId}/repos?repo_full_name=${encodeURIComponent(repoFullName)}`, {
          method: "DELETE"
        });
        setAllowedRepos(prev => {
          const next = new Set(prev);
          next.delete(repoFullName);
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to toggle repo", err);
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
