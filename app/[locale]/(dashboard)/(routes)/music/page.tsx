// app/(dashboard)/(routes)/music/page.tsx
"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { formSchema } from "./constants";
import { Heading } from "@/components/heading";
import { DiscIcon } from "@radix-ui/react-icons";
import { Form, FormField, FormItem, FormControl } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { z } from "zod";
import EmptyState from "@/components/empty";
import axios from "axios";
import { ShareButton } from "@/components/share-button";
import YouTubeEmbed from "@/components/music/youtube-embed";
import StereoBars from "@/components/music/stereo-bars";

const DEFAULT_YOUTUBE_VIDEO_ID = "5qap5aO4i9A";
const DEFAULT_YOUTUBE_TITLE = "Lofi beats";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string;
  error?: {
    detail: string;
  };
}

const MusicPage = () => {
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [showYouTube, setShowYouTube] = useState(false);

  const t = useTranslations("Music");
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
    },
  });

  useEffect(() => {
    if (!predictionId || !isLoading) return;

    const interval = setInterval(async () => {
      try {
        const response = await axios.get<ReplicatePrediction>(`/api/music/predictions/${predictionId}`);
        const prediction = response.data;

        switch (prediction.status) {
          case "succeeded":
            setMusicUrl(prediction.output || null);
            setIsLoading(false);
            setPredictionId(null);
            form.reset();
            clearInterval(interval);
            break;

          case "failed":
          case "canceled":
            setError(prediction.error?.detail || "Music generation failed.");
            setIsLoading(false);
            setPredictionId(null);
            clearInterval(interval);
            break;

          case "starting":
          case "processing":
            break;
        }
      } catch (err: any) {
        console.error("[MUSIC_POLLING_ERROR]", err);
        setError("Failed to get music status. Please try again.");
        setIsLoading(false);
        setPredictionId(null);
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [predictionId, isLoading, form]);

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    setError(null);
    setMusicUrl(null);
    setIsLoading(true);
    setPredictionId(null);

    try {
      const response = await axios.post<ReplicatePrediction>("/api/music", values);
      const prediction = response.data;

      if (prediction && prediction.id) {
        setPredictionId(prediction.id);
      } else {
        throw new Error("API response did not contain a prediction ID.");
      }
    } catch (error: any) {
      console.error("[MUSIC_PAGE_ERROR]", error);
      const errorMessage = error.response?.data?.details || "Sorry, something went wrong starting the music generation.";
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const hasContent = !isLoading && !error && (musicUrl || showYouTube);

  return (
    <div className="flex flex-col min-h-screen">
      <Heading
        title={t("title")}
        description={t("description")}
        icon={DiscIcon}
        iconColor="text-emerald-500"
        bgColor="bg-emerald-500/10"
      />
      <div className="px-4 lg:px-8">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="relative rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-background via-background to-emerald-500/5 backdrop-blur-xl w-full p-4 sm:p-6 shadow-2xl shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-teal-500/5 rounded-2xl pointer-events-none" />
            <div className="relative z-10 flex flex-col sm:flex-row gap-3 items-end">
              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormControl className="m-0 p-0">
                      <Input
                        className="border-0 bg-background/50 backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded-xl px-4 py-3 transition-all duration-200"
                        disabled={isLoading}
                        placeholder="🎵 Describe your sound..."
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button
                className="w-full sm:w-auto min-w-[120px] shrink-0 relative z-10 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 rounded-xl font-semibold"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </span>
                ) : (
                  "🎵 Generate"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>

      <div className="flex justify-center mt-4 sm:mt-6 px-4 lg:px-8">
        <Button
          variant="secondary"
          className="bg-gradient-to-r from-emerald-600/10 to-teal-600/10 hover:from-emerald-600/20 hover:to-teal-600/20 border-emerald-500/20 rounded-xl transition-all duration-300"
          onClick={() => setShowYouTube((v) => !v)}
        >
          {showYouTube ? "Hide Free Beat" : "Use a Free Beat"}
        </Button>
      </div>

      <div className="flex-1 space-y-4 sm:space-y-6 mt-4 sm:mt-8 px-4 lg:px-8">
        {isLoading && (
          <div className="relative rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-background to-emerald-500/5 p-8 sm:p-16 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 animate-pulse" />
            <div className="relative flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/30 blur-xl rounded-full animate-pulse" />
                <div className="relative h-16 w-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-lg font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Composing your track...
                </p>
                <p className="text-sm text-muted-foreground">
                  AI is crafting your musical masterpiece 🎵
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-background to-red-500/5 p-6 sm:p-8">
            <p className="text-red-500 text-center text-sm">{error}</p>
          </div>
        )}

        {showYouTube && (
          <div className="space-y-4">
            <YouTubeEmbed videoId={DEFAULT_YOUTUBE_VIDEO_ID} title={DEFAULT_YOUTUBE_TITLE} />
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <StereoBars active />
              <p className="text-sm text-muted-foreground">
                Free background beat — use this while you compose your own prompt.
              </p>
            </div>
          </div>
        )}

        {!musicUrl && !isLoading && !error && !showYouTube && (
          <div className="rounded-2xl border border-emerald-500/10 bg-gradient-to-br from-background to-emerald-500/5 p-8 sm:p-12">
            <EmptyState label={t("empty")} />
          </div>
        )}

        {musicUrl && !isLoading && !error && (
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-background to-emerald-500/5 p-4 sm:p-6 shadow-2xl shadow-emerald-500/10">
            <audio controls className="w-full rounded-xl mb-4 shadow-lg">
              <source src={musicUrl} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
            <div className="flex flex-col sm:flex-row justify-center gap-2">
              <Button
                onClick={() => window.open(musicUrl)}
                variant="secondary"
                className="bg-gradient-to-r from-emerald-600/10 to-teal-600/10 hover:from-emerald-600/20 hover:to-teal-600/20 border-emerald-500/20 rounded-xl transition-all duration-300"
              >
                Download Track
              </Button>
              <ShareButton
                content={{
                  title: "AI Generated Music by Genie",
                  text: "🎵 Check out this AI-generated track I created with Genie's Juke Box!",
                  url: musicUrl,
                }}
                variant="outline"
                className="bg-background/50 backdrop-blur-sm border-emerald-500/20 hover:border-emerald-500/40 rounded-xl"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MusicPage;
