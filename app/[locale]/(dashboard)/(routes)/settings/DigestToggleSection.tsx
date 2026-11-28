"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";

export function DigestToggleSection({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  const handleToggle = async (next: boolean) => {
    const previous = enabled;
    setEnabled(next); // optimistic
    setSaving(true);
    try {
      const response = await fetch('/api/settings/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update settings');
      }
    } catch (err) {
      console.error("Error updating digest settings:", err);
      setEnabled(previous); // revert
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={saving}
      />
      <span className="text-sm font-medium text-muted-foreground">
        {enabled ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  );
}
