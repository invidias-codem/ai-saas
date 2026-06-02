"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

// Ensure this matches your Supabase schema and Go struct
interface RootGrant {
  id: string;
  path: string;
  label: string;
  read_only: boolean;
  allow_destructive: boolean;
}

export function LocalRootSelector({ workspaceId }: { workspaceId: string }) {
  const { getToken, userId } = useAuth();
  const [grants, setGrants] = useState<RootGrant[]>([]);
  const [newPath, setNewPath] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [readOnly, setReadOnly] = useState(true);
  const [allowDestructive, setAllowDestructive] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Fetch existing grants from Supabase on load
  useEffect(() => {
    async function fetchGrants() {
      const res = await fetch(`/api/workspaces/${workspaceId}/harness/grants`);
      if (res.ok) {
        const data = await res.json();
        setGrants(data);
      }
    }
    fetchGrants();
  }, [workspaceId]);

  // 2. Add and Sync
  const handleAuthorizeRoot = async () => {
    if (!newPath || !newLabel) return;
    setIsSyncing(true);

    try {
      const token = await getToken();
      
      // A. Save to Supabase (The Cloud Truth)
      const dbRes = await fetch(`/api/workspaces/${workspaceId}/harness/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          path: newPath, 
          label: newLabel, 
          read_only: readOnly,
          allow_destructive: allowDestructive
        })
      });
      
      if (!dbRes.ok) throw new Error("Failed to save to database");
      const newGrant: RootGrant = await dbRes.json();
      
      const updatedGrants = [...grants, newGrant];
      setGrants(updatedGrants);

      // B. Hydrate the Local Go Daemon (The Local Brakes)
      // Assuming your Go JSON-RPC server is listening on a local port (e.g., 4000)
      const rpcPayload = {
        jsonrpc: "2.0",
        method: "sync_root_grants",
        params: {
          api_base_url: window.location.origin + "/api",
          auth_token: token,
          workspace_id: workspaceId,
          user_id: userId,
          grants: updatedGrants
        },
        id: Date.now()
      };

      const daemonRes = await fetch("http://127.0.0.1:4000/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpcPayload)
      });

      if (!daemonRes.ok) throw new Error("Go daemon unreachable or rejected payload");

      setNewPath("");
      setNewLabel("");
      setReadOnly(true);
      setAllowDestructive(false);
    } catch (error) {
      console.error("[SYNC_ERROR]", error);
      // In production, trigger a Toast notification here
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Local Directory Access</h2>
      <p className="text-sm text-gray-500 mb-6">
        Authorize specific local directories for the agent to access. Lattice operates in strict read-only mode.
      </p>

      {/* Authorized Roots List */}
      <div className="space-y-3 mb-6">
        {grants.map((grant) => (
          <div key={grant.id} className="flex items-center justify-between p-3 bg-gray-50 border rounded-md">
            <div>
              <p className="text-sm font-medium text-gray-900">{grant.label}</p>
              <p className="text-xs text-gray-500 font-mono">{grant.path}</p>
            </div>
            <div className="flex gap-2">
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${grant.read_only ? 'text-green-700 bg-green-100' : 'text-blue-700 bg-blue-100'}`}>
                {grant.read_only ? 'Read Only' : 'Read/Write'}
              </span>
              {!grant.read_only && grant.allow_destructive && (
                <span className="px-2 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded-full">
                  Destructive Allowed
                </span>
              )}
            </div>
          </div>
        ))}
        {grants.length === 0 && (
          <p className="text-sm text-gray-400 italic">No directories authorized yet.</p>
        )}
      </div>

      {/* Add New Root Form */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Label (e.g., Frontend Repo)"
              className="flex-1 px-3 py-2 text-sm border rounded-md"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <div className="flex gap-4 items-center px-2">
              <label className="flex items-center gap-1 text-sm">
                <input 
                  type="radio" 
                  checked={readOnly} 
                  onChange={() => { setReadOnly(true); setAllowDestructive(false); }} 
                /> Read Only
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input 
                  type="radio" 
                  checked={!readOnly} 
                  onChange={() => setReadOnly(false)} 
                /> Read/Write
              </label>
              {!readOnly && (
                <label className="flex items-center gap-1 text-sm text-red-600 font-medium ml-2">
                  <input 
                    type="checkbox" 
                    checked={allowDestructive} 
                    onChange={(e) => setAllowDestructive(e.target.checked)} 
                  /> Allow Delete
                </label>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Absolute Path (e.g., /Users/name/projects/app)"
              className="w-full px-3 py-2 text-sm border rounded-md font-mono"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
            />
            {/* Electron IPC Hook Placeholder */}
            <button 
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border rounded-md hover:bg-gray-200"
              onClick={() => {
                // if (window.lattice) {
                //   window.lattice.selectDirectory().then(path => setNewPath(path));
                // }
              }}
            >
              Browse
            </button>
          </div>
        </div>
        <button
          onClick={handleAuthorizeRoot}
          disabled={isSyncing || !newPath || !newLabel}
          className="self-end px-4 py-2 text-sm font-medium text-white bg-black rounded-md disabled:bg-gray-400"
        >
          {isSyncing ? "Syncing..." : "Authorize"}
        </button>
      </div>
    </div>
  );
}
