"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

export interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  kind: string;
  is_default: boolean;
  onboarding_state: string;
  default_operating_profile_id: string | null;
}

export function useDefaultWorkspace() {
  const { userId } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      // Avoid synchronous setState inside effect — schedule a microtask instead.
      Promise.resolve().then(() => setLoading(false));
      return;
    }

    let cancelled = false;

    const fetchWorkspace = async () => {
      try {
        const res = await fetch("/api/workspaces/default", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;

        if (res.ok && data.workspace) {
          setWorkspace(data.workspace);
        } else {
          setError(data.error || "Failed to load workspace");
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load workspace");
        }
      } finally {
        if (!cancelled) {
          Promise.resolve().then(() => setLoading(false));
        }
      }
    };

    fetchWorkspace();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { workspace, loading, error };
}