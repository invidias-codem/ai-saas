"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { MediaEnvelope } from "@/lib/media/envelope";
import { GenerationLoading, GenerationError, GenerationEmpty } from "@/components/media/GenerationStates";

interface PolledPrediction {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: { detail?: string };
}

function singleOutput(p: PolledPrediction): string | null {
  return typeof p.output === "string" ? p.output : null;
}

/**
 * Renders a media tool result inline in the chat bubble.
 *  - image: synchronous — renders the URL grid directly.
 *  - music/video: asynchronous — polls `envelope.pollUrl` (prediction already
 *    created by the tool) and swaps to an <audio>/<video> player on completion.
 *
 * Reuses `useMediaGeneration`'s status lifecycle implicitly via the same
 * Replicate status contract, and `GenerationStates` for loading/error/empty UI.
 */
export function InlineMediaCard({ envelope }: { envelope: MediaEnvelope }) {
  if (envelope.type === "image") {
    return <ImageGrid urls={envelope.urls ?? []} />;
  }

  return <AsyncMedia envelope={envelope} />;
}

function ImageGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) {
    return <GenerationEmpty accent="violet" label="No images were generated." />;
  }
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {urls.map((url) => (
        <div key={url} className="relative aspect-square rounded-xl overflow-hidden border border-border/50">
          <Image alt="Generated" fill unoptimized src={url} className="object-cover" />
        </div>
      ))}
    </div>
  );
}

function AsyncMedia({ envelope }: { envelope: MediaEnvelope }) {
  const [status, setStatus] = useState<"processing" | "succeeded" | "failed">("processing");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!envelope.pollUrl) {
      setStatus("failed");
      setError("Missing poll URL for media generation.");
      return;
    }

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(envelope.pollUrl!);
        const prediction: PolledPrediction = await res.json();

        switch (prediction.status) {
          case "succeeded":
            if (cancelled) return;
            setUrl(singleOutput(prediction));
            setStatus("succeeded");
            clearInterval(interval);
            break;
          case "failed":
          case "canceled":
            if (cancelled) return;
            setError(prediction.error?.detail || "Generation failed.");
            setStatus("failed");
            clearInterval(interval);
            break;
          case "starting":
          case "processing":
            break;
        }
      } catch (e: any) {
        if (cancelled) return;
        setError("Failed to check generation status.");
        setStatus("failed");
        clearInterval(interval);
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [envelope.pollUrl]);

  if (status === "failed") {
    return <GenerationError message={error ?? "Generation failed."} />;
  }

  if (status === "succeeded" && url) {
    return envelope.type === "video" ? (
      <video controls className="w-full rounded-xl mt-2" src={url} controlsList="nodownload" />
    ) : (
      <audio controls className="w-full rounded-xl mt-2" src={url} />
    );
  }

  return (
    <GenerationLoading
      accent={envelope.type === "video" ? "pink" : "emerald"}
      title={envelope.type === "video" ? "Creating your video..." : "Composing your track..."}
      subtitle="This may take a moment."
    />
  );
}