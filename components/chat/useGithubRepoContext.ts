"use client";

import { useEffect, useState } from "react";

interface RepoInfo {
  owner: string;
  repo: string;
  fileCount: number;
}

interface UseGithubRepoContextOptions {
  workspaceId: string | null;
  /** Called after a repo is selected + persisted, so the orchestrator can add a system message + clear the greeting. */
  onRepoLinked: (fullName: string, fileCount: number) => void;
}

/**
 * GitHub repo context for the code generator: active repo, linked-repo
 * hydration, index status, and reindex. Owns the workspace PATCH write-back so
 * a selected repo persists across reloads and is shared with Settings.
 *
 * Extracted from code/page.tsx (C3). Removed dead code from the original:
 * `handleRepoIndexComplete` (unwired — now wired as the modal's onIndexComplete),
 * `reindexError` (never read), and `linkedRepos` (intermediate only, never
 * rendered). The persist-on-select path is now actually wired.
 */
export function useGithubRepoContext({
  workspaceId,
  onRepoLinked,
}: UseGithubRepoContextOptions) {
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  const [repoIndexed, setRepoIndexed] = useState<boolean | null>(null);
  const [reindexing, setReindexing] = useState(false);

  // Hydrate repo context from workspace-linked repos once code context is available.
  useEffect(() => {
    let cancelled = false;
    async function loadLinkedRepos() {
      if (!workspaceId) return;
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/repos`);
        if (!res.ok) return;
        const data = await res.json();
        const repos: string[] = Array.isArray(data.repos) ? data.repos : [];
        if (cancelled) return;
        const savedActive =
          typeof data.active_github_repo === "string" ? data.active_github_repo : null;
        const hydrated = savedActive && repos.includes(savedActive) ? savedActive : repos[0] || null;
        setActiveRepo(hydrated);
      } catch (err) {
        console.error("[CodePage] Failed to fetch workspace repos:", err);
      }
    }
    loadLinkedRepos();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Reload workspace repo selection when Settings persists changes in the same tab.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      if (!workspaceId) return;
      fetch(`/api/workspaces/${workspaceId}/repos`)
        .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
        .then((data) => {
          if (!data) return;
          const repos: string[] = Array.isArray(data.repos) ? data.repos : [];
          const savedActive =
            typeof data.active_github_repo === "string" ? data.active_github_repo : null;
          const hydrated =
            savedActive && repos.includes(savedActive) ? savedActive : repos[0] || null;
          setActiveRepo(hydrated);
        })
        .catch((err) =>
          console.error("[CodePage] Failed to reload workspace repos after settings sync:", err)
        );
    };
    window.addEventListener("workspace:repo-sync", handler as EventListener);
    return () => window.removeEventListener("workspace:repo-sync", handler as EventListener);
  }, [workspaceId]);

  // Check indexing status for the active repo so the UI can show whether chunks exist.
  useEffect(() => {
    if (!activeRepo) return;
    let cancelled = false;
    async function loadStatus() {
      try {
        const res = await fetch(`/api/github/index/status?repo=${encodeURIComponent(activeRepo!)}`);
        const data = await res.json().catch(() => ({} as any));
        if (cancelled) return;
        setRepoIndexed(Boolean(data?.indexed));
      } catch {
        if (!cancelled) setRepoIndexed(null);
      }
    }
    loadStatus();
    return () => {
      cancelled = true;
    };
  }, [activeRepo]);

  const openRepoModal = () => {
    setIsRepoModalOpen(true);
  };

  const closeRepoModal = () => {
    setIsRepoModalOpen(false);
  };

  const reindexActiveRepo = async () => {
    if (!activeRepo || reindexing) return;
    setReindexing(true);
    try {
      const res = await fetch("/api/github/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: activeRepo.split("/")[0],
          repo: activeRepo.split("/")[1],
        }),
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) throw new Error(text || "Indexing failed");
    } catch (err: any) {
      console.error("[CodePage] Re-index failed:", err);
    } finally {
      setReindexing(false);
    }
  };

  // Wired to the repo modal's onIndexComplete: set active repo, persist it to
  // the workspace (survives reload + shared with Settings), then notify the
  // orchestrator to add the confirmation system message.
  const handleRepoIndexComplete = async (repoInfo: RepoInfo) => {
    const fullName = `${repoInfo.owner}/${repoInfo.repo}`;
    setActiveRepo(fullName);
    setIsRepoModalOpen(false);

    try {
      if (workspaceId) {
        await fetch(`/api/workspaces/${workspaceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active_github_repo: fullName }),
        });
      }
    } catch (err) {
      console.error("[CodePage] Failed to persist active repo:", err);
    }

    onRepoLinked(fullName, repoInfo.fileCount);
  };

  return {
    activeRepo,
    isRepoModalOpen,
    repoIndexed,
    reindexing,
    openRepoModal,
    closeRepoModal,
    reindexActiveRepo,
    handleRepoIndexComplete,
  };
}