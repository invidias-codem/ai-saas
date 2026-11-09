"use client";

import { useState } from "react";
import { Key, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StickyActionBar } from "@/components/ui/form-mobile";

type ProviderName = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'huggingface';

type KeyStatus = { configured: boolean; preview: string | null };

const DEFAULT_KEYS: Record<ProviderName, KeyStatus> = {
  openai: { configured: false, preview: null },
  anthropic: { configured: false, preview: null },
  google: { configured: false, preview: null },
  openrouter: { configured: false, preview: null },
  huggingface: { configured: false, preview: null },
};

const providerLabels: Record<ProviderName, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  openrouter: 'OpenRouter',
  huggingface: 'Hugging Face',
};

const providerPlaceholders: Record<ProviderName, string> = {
  openai: 'sk-... or proj-...',
  anthropic: 'sk-ant-...',
  google: 'AIza...',
  openrouter: 'sk-or-v1-...',
  huggingface: 'hf_...',
};

const providerDescriptions: Record<ProviderName, string> = {
  openai: 'Used first by Code Builder planning when configured.',
  anthropic: 'Used by Code Builder code generation and agentic conversation/code modes.',
  google: 'Used by Gemini planning, review, multimodal fallback, and quality conversation modes.',
  openrouter: 'Optional fast-mode gateway to open models. Only used when an OpenRouter key is saved.',
  huggingface: 'Bring your own Hugging Face Inference Providers token for open-weight model routing.',
};

interface Props {
  initialKeys: Record<ProviderName, KeyStatus> | null;
}

export function ProviderKeysSection({ initialKeys }: Props) {
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<ProviderName, string>>({
    openai: '', anthropic: '', google: '', openrouter: '', huggingface: ''
  });
  const [configuredKeys, setConfiguredKeys] = useState<Record<ProviderName, KeyStatus>>(
    initialKeys ?? DEFAULT_KEYS
  );
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [keySuccess, setKeySuccess] = useState("");

  const hasKeyChanges = Object.values(apiKeyInputs).some(v => v.length > 0);

  const handleSaveApiKey = async (provider: ProviderName) => {
    setKeyError("");
    setKeySuccess("");
    const apiKey = apiKeyInputs[provider];
    const validFormat = provider === 'openai'
      ? (apiKey.startsWith('sk-') || apiKey.startsWith('proj-'))
      : provider === 'anthropic'
        ? apiKey.startsWith('sk-ant-')
        : provider === 'openrouter'
          ? apiKey.startsWith('sk-or-v1-')
          : provider === 'huggingface'
            ? apiKey.startsWith('hf_')
            : apiKey.startsWith('AIza');

    if (!validFormat) {
      setKeyError(`Invalid ${providerLabels[provider]} API key format.`);
      return;
    }

    setIsSavingKey(true);
    try {
      let savedViaNative = false;
      if (provider === 'openrouter') {
        try {
          const { createSecretStore } = await import('@/lib/native/secretStore');
          const store = await createSecretStore();
          await store.setSecret('openrouter_api_key', apiKey);
          savedViaNative = true;
        } catch (nativeErr) {
          console.warn('[Settings] Native secret store unavailable, falling back to API:', nativeErr);
        }
      }

      if (!savedViaNative) {
        const res = await fetch('/api/settings/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey })
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText);
        }

        const data = await res.json();
        if (data.providers) setConfiguredKeys(data.providers);
      }

      setApiKeyInputs(prev => ({ ...prev, [provider]: '' }));
      setKeySuccess(`${providerLabels[provider]} API key securely stored!`);
    } catch (err: any) {
      setKeyError(err.message || "Failed to save API Key");
    } finally {
      setIsSavingKey(false);
    }
  };

  return (
    <Card className="min-w-0 max-w-full border-black/5 p-4 sm:p-6">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 p-2 rounded-lg bg-emerald-600/10">
            <Key className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">AI Provider Keys</h3>
            <p className="text-sm text-muted-foreground">
              Bring your own OpenAI, Anthropic, and Google keys. Keys are validated server-side, encrypted in Supabase Vault, and never displayed back to the browser.
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-4">
          {(['openai', 'anthropic', 'google', 'openrouter', 'huggingface'] as ProviderName[]).map((provider) => {
            const status = configuredKeys[provider];
            const inputValue = apiKeyInputs[provider];
            return (
              <div key={provider} className="min-w-0 rounded-lg border p-3 sm:p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold flex flex-wrap items-center gap-2 break-words">
                      {providerLabels[provider]}
                      {status.configured && (
                        <span className="bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full text-xs font-bold">
                          Configured{status.preview ? ` · ${status.preview}` : ''}
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-muted-foreground">{providerDescriptions[provider]}</p>
                  </div>
                </div>
                <div className="flex min-w-0 max-w-2xl flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                  <input
                    type="password"
                    value={inputValue}
                    onChange={(e) => setApiKeyInputs(prev => ({ ...prev, [provider]: e.target.value }))}
                    placeholder={status.configured ? `Enter new ${providerLabels[provider]} key to replace existing...` : providerPlaceholders[provider]}
                    className="w-full min-w-0 flex h-11 sm:h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSavingKey}
                  />
                  <Button
                    onClick={() => handleSaveApiKey(provider)}
                    disabled={!inputValue || isSavingKey}
                    className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-24 shrink-0"
                  >
                    {isSavingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {keyError && <p className="text-xs text-destructive">{keyError}</p>}
        {keySuccess && <p className="text-xs text-emerald-600">{keySuccess}</p>}
      </div>

      <StickyActionBar visible={hasKeyChanges}>
        <Button
          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => {
            (['openai', 'anthropic', 'google', 'openrouter', 'huggingface'] as ProviderName[]).forEach(provider => {
              if (apiKeyInputs[provider]) handleSaveApiKey(provider);
            });
          }}
          disabled={isSavingKey}
        >
          {isSavingKey ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save All Keys
        </Button>
      </StickyActionBar>
    </Card>
  );
}
