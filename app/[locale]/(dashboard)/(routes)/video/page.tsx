// app/(dashboard)/(routes)/video/page.tsx
"use client";

// ✅ Added useEffect
import { useState, useEffect } from "react";
import { formSchema, resolutionOptions, durationOptions, aspectRatioOptions } from './constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heading } from '@/components/heading';
import { KoFiNudge } from "@/components/kofi-nudge";
import { useSupportNudge } from "@/hooks/use-support-nudge";
import { VideoIcon, DownloadIcon } from "@radix-ui/react-icons";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormControl } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { z } from 'zod';
import EmptyState from '@/components/empty';
import axios from 'axios';
import { ShareButton } from '@/components/share-button';

// ✅ Define the structure of the prediction object we expect
interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string; // Expecting a single string URL as output based on your previous route
  error?: {
    detail: string;
  };
}

const VideoPage = () => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "completed" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  // ✅ Added state to hold the prediction ID
  const [predictionId, setPredictionId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: '',
      aspectRatio: "16:9",
      duration: "4",
      resolution: "720p",
    },
  });

  const isLoading = status === "generating";

  // ✅ useEffect hook for polling the prediction status
  useEffect(() => {
    // Stop polling if there's no prediction ID or the job is done
    if (!predictionId || status !== "generating") {
      return;
    }

    // Set up an interval to poll every 3 seconds
    const interval = setInterval(async () => {
      try {
        const response = await axios.get<ReplicatePrediction>(`/api/video/predictions/${predictionId}`);
        const prediction = response.data;

        switch (prediction.status) {
          case "succeeded":
            setStatus("completed");
            setVideoUrl(prediction.output || null); // Set the output URL
            setPredictionId(null); // Clear ID to stop polling
            trackActivity("video");
            form.reset(); // Reset form on success
            clearInterval(interval);
            break;

          case "failed":
          case "canceled":
            setStatus("failed");
            setError(prediction.error?.detail || "Video generation failed.");
            setPredictionId(null); // Clear ID to stop polling
            clearInterval(interval);
            break;

          case "starting":
          case "processing":
            // Still generating, do nothing and let the interval continue
            setStatus("generating");
            break;
        }
      } catch (err: any) {
        console.error("[VIDEO_POLLING_ERROR]", err);
        setStatus("failed");
        setError("Failed to get video status. Please try again.");
        setPredictionId(null); // Clear ID to stop polling
        clearInterval(interval);
      }
    }, 3000); // Poll every 3 seconds

    // Cleanup function to clear the interval
    return () => clearInterval(interval);

  }, [predictionId, status, form, trackActivity]); // Dependencies for the hook


  // ✅ Updated Form submission handler
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setError(null);
    setVideoUrl(null);
    setStatus("generating");
    setPredictionId(null); // Clear any old prediction ID

    try {
      // Call the API to *start* the prediction
      console.log("Sending data to /api/video:", values);
      // ✅ Expect the initial prediction object in response
      const response = await axios.post<ReplicatePrediction>("/api/video", values);
      const prediction = response.data;

      if (prediction && prediction.id) {
        // ✅ Set the prediction ID to start polling
        setPredictionId(prediction.id);
      } else {
        throw new Error("API response did not contain a prediction ID.");
      }
      // Note: We do NOT reset the form here anymore, only on success

    } catch (err: any) {
      console.error("[VIDEO_PAGE_SUBMIT_ERROR]", err);
      setError(err.response?.data?.details || "Failed to start video generation.");
      setStatus("failed");
    }
  };

  // Helper function for status messages
  const getStatusMessage = (): string => {
    switch (status) {
      // ✅ Updated generating message
      case "generating": return "Genie is creating your video... this may take a moment.";
      case "completed": return "Your video is ready!";
      case "failed": return "Video generation failed.";
      default: return "Generate a video based on your prompt.";
    }
  };

  // Nudge Integration
  const { showNudge, trackActivity, dismissNudge } = useSupportNudge();

  return (
    <div>
      <KoFiNudge isOpen={showNudge} onClose={dismissNudge} />
      <Heading
        title="Quick Clip"
        description="Generate videos with Replicate!"
        icon={VideoIcon}
        iconColor="text-pink-700"
        bgColor="bg-pink-700/10"
      />
      <div className='px-4 lg:px-8'>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="relative rounded-2xl border border-pink-700/20 bg-gradient-to-br from-background via-background to-pink-700/5 backdrop-blur-xl w-full p-6 shadow-2xl shadow-pink-700/10 hover:shadow-pink-700/20 transition-all duration-300 flex flex-col md:flex-row flex-wrap gap-4 items-end"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-pink-700/5 via-transparent to-rose-500/5 rounded-2xl pointer-events-none" />
            {/* --- PROMPT FIELD --- */}
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem className='w-full relative z-10'>
                  <FormControl className='m-0 p-0'>
                    <Input
                      className='border-0 bg-background/50 backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-pink-700/50 rounded-xl px-4 py-3 transition-all duration-200'
                      disabled={isLoading}
                      placeholder="🎬 Describe your scene... (e.g., A drone flying over a futuristic city at sunset)"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* --- ASPECT RATIO FIELD --- */}
            <FormField
              control={form.control}
              name="aspectRatio"
              render={({ field }) => (
                <FormItem className="flex-1 min-w-[120px] relative z-10">
                  <Select
                    disabled={isLoading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background/50 backdrop-blur-sm border-pink-700/20 rounded-xl hover:border-pink-700/40 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-background/95 backdrop-blur-xl border-pink-700/20">
                      {aspectRatioOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="hover:bg-pink-700/10">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {/* --- DURATION FIELD --- */}
            <FormField
              control={form.control}
              name="duration"
              render={({ field }) => (
                <FormItem className="flex-1 min-w-[120px] relative z-10">
                  <Select
                    disabled={isLoading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background/50 backdrop-blur-sm border-pink-700/20 rounded-xl hover:border-pink-700/40 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-background/95 backdrop-blur-xl border-pink-700/20">
                      {durationOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="hover:bg-pink-700/10">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {/* --- GENERATE BUTTON --- */}
            <Button
              className="w-full md:w-auto min-w-[120px] relative z-10 bg-gradient-to-r from-pink-700 to-rose-600 hover:from-pink-600 hover:to-rose-500 text-white shadow-lg shadow-pink-700/30 hover:shadow-pink-700/50 transition-all duration-300 rounded-xl font-semibold"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </span>
              ) : (
                "🎬 Generate"
              )}
            </Button>
          </form>
        </Form>
      </div>

      {/* --- RENDER AREA --- */}
      <div className='space-y-6 mt-8 px-4 lg:px-8'>
        {/* Loading/Status Message */}
        {isLoading && (
          <div className="relative rounded-2xl border border-pink-700/20 bg-gradient-to-br from-background to-pink-700/5 p-16 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-pink-700/10 via-rose-500/10 to-pink-700/10 animate-pulse" />
            <div className="relative flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-pink-700/30 blur-xl rounded-full animate-pulse" />
                <div className="relative h-16 w-16 border-4 border-pink-700/30 border-t-pink-700 rounded-full animate-spin" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-lg font-semibold bg-gradient-to-r from-pink-700 to-rose-600 bg-clip-text text-transparent">
                  {getStatusMessage()}
                </p>
                <p className="text-sm text-muted-foreground">
                  Crafting your cinematic moment 🎬
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-background to-red-500/5 p-8">
            <p className="text-red-500 text-center">{error}</p>
          </div>
        )}

        {/* Idle/Empty State */}
        {status === "idle" && !isLoading && !error && !videoUrl && (
          <div className="rounded-2xl border border-pink-700/10 bg-gradient-to-br from-background to-pink-700/5 p-12">
            <EmptyState label="Ready to create your video! 🎬" />
          </div>
        )}

        {/* Completed State */}
        {status === "completed" && videoUrl && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <div className="w-full max-w-2xl rounded-2xl overflow-hidden border border-pink-700/20 bg-gradient-to-br from-background to-pink-700/5 p-4 shadow-2xl shadow-pink-700/10">
              <video
                controls
                controlsList="nodownload noremoteplayback"
                className="w-full rounded-xl shadow-lg mb-4"
                src={videoUrl}
              >
                Your browser does not support the video tag.
              </video>
              <div className="flex gap-2 w-full">
                <a
                  href={videoUrl}
                  download={`genie-video-${Date.now()}.mp4`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center px-4 py-3 bg-gradient-to-r from-pink-700 to-rose-600 hover:from-pink-600 hover:to-rose-500 text-white shadow-lg shadow-pink-700/30 hover:shadow-pink-700/50 transition-all duration-300 rounded-xl font-semibold"
                >
                  <DownloadIcon className="mr-2 h-4 w-4" /> Download Video
                </a>
                <ShareButton
                  content={{
                    title: "AI Generated Video by Genie",
                    text: "🎬 Check out this AI-generated video I created with Genie's Quick Clip!",
                    url: videoUrl,
                  }}
                  variant="outline"
                  className="bg-background/50 backdrop-blur-sm border-pink-700/20 hover:border-pink-700/40 rounded-xl"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPage;