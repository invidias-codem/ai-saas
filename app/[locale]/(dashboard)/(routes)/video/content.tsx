// app/(dashboard)/(routes)/video/page.tsx
"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { videoFormSchema as formSchema, videoResolutionOptions as resolutionOptions, videoDurationOptions as durationOptions, videoAspectRatioOptions as aspectRatioOptions } from '@/components/media/config';
import { singleOutput, type ReplicatePrediction } from '@/components/media/types';
import { useMediaGeneration } from '@/components/media/useMediaGeneration';
import { VideoResult } from '@/components/media/VideoResult';
import { GenerationLoading, GenerationError, GenerationEmpty } from "@/components/media/GenerationStates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heading } from '@/components/heading';
import { KoFiNudge } from "@/components/kofi-nudge";
import { useSupportNudge } from "@/hooks/use-support-nudge";
import { VideoIcon } from "@radix-ui/react-icons";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormControl } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { z } from 'zod';
import { ParameterDrawer, ParameterSection } from "@/components/ui/parameter-drawer";
import { Settings2 } from "lucide-react";

export function VideoContent({ initialPrediction = null }: { initialPrediction?: ReplicatePrediction | null }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(() => initialPrediction ? singleOutput(initialPrediction) : null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(initialPrediction?.downloadUrl ?? null);
  const [error, setError] = useState<string | null>(initialPrediction?.error?.detail ?? null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);

  const [showParameters, setShowParameters] = useState(false);

  // Nudge Integration
  const { showNudge, trackActivity, dismissNudge } = useSupportNudge();

  const t = useTranslations("Video");
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: '',
      aspectRatio: "16:9",
      duration: "4",
      resolution: "720p",
    },
  });

  // Video generation dispatch (M4): async POST + 3s poll, drives videoUrl/status/error.
  const { status, isLoading, start } = useMediaGeneration({
    submitUrl: "/api/video",
    pollUrlTemplate: "/api/video/predictions/${id}",
    initialPrediction,
    onSucceeded: (prediction) => {
      setVideoUrl(singleOutput(prediction));
      setDownloadUrl(prediction.downloadUrl ?? null);
      setPlaybackError(null);
      trackActivity("video");
      form.reset();
    },
    onFailed: (message) => setError(message),
  });

  // ✅ Updated Form submission handler
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setError(null);
    setVideoUrl(null);
    setDownloadUrl(null);
    setPlaybackError(null);
    await start(values, (err: any) => {
      const details = err?.response?.data?.details;
      // Server returns Zod .flatten().fieldErrors: {field: [msg, ...]} — turn it
      // into one readable line instead of handing an object to setError.
      let message = "Failed to start video generation.";
      if (typeof details === "string") {
        message = details;
      } else if (details && typeof details === "object") {
        const parts = Object.entries(details).map(
          ([field, msgs]) => `${field}: ${(Array.isArray(msgs) ? msgs : [msgs]).join(", ")}`
        );
        if (parts.length > 0) message = parts.join("; ");
      } else if (err?.response?.data?.error) {
        message = String(err.response.data.error);
      }
      setError(message);
      return message;
    });
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


  return (
    <div>
      <KoFiNudge isOpen={showNudge} onClose={dismissNudge} />
      <Heading
        title={t('title')}
        description={t('description')}
        icon={VideoIcon}
        iconColor="text-pink-700"
        bgColor="bg-pink-700/10"
      />
      <div className='px-4 lg:px-8'>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="relative rounded-2xl border border-pink-700/20 bg-gradient-to-br from-background via-background to-pink-700/5 backdrop-blur-xl w-full p-4 sm:p-6 shadow-2xl shadow-pink-700/10 hover:shadow-pink-700/20 transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-pink-700/5 via-transparent to-rose-500/5 rounded-2xl pointer-events-none" />
                
            <div className="relative z-10 flex flex-col sm:flex-row gap-3 items-end">
              {/* --- PROMPT FIELD --- */}
              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem className='w-full'>
                    <FormControl className='m-0 p-0'>
                      <Input
                        className='border-0 bg-background/50 backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-pink-700/50 rounded-xl px-4 py-3 transition-all duration-200'
                        disabled={isLoading}
                        placeholder="🎬 Describe your scene..."
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* --- PARAMETER DRAWER TRIGGER (all viewports) --- */}
              <div>
                <ParameterDrawer
                  open={showParameters}
                  onOpenChange={setShowParameters}
                  title="Video Settings"
                  renderTrigger={(onToggle) => (
                    <button
                      type="button"
                      onClick={onToggle}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-pink-700/20 bg-background/50 backdrop-blur-sm hover:border-pink-700/40 transition-colors text-sm font-medium"
                    >
                      <Settings2 className="h-4 w-4" />
                      Tune
                    </button>
                  )}
                >
                  <div className="space-y-6">
                    <ParameterSection title="Aspect Ratio">
                      <FormField
                        control={form.control}
                        name="aspectRatio"
                        render={({ field }) => (
                          <FormItem>
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
                    </ParameterSection>
                    <ParameterSection title="Duration">
                      <FormField
                        control={form.control}
                        name="duration"
                        render={({ field }) => (
                          <FormItem>
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
                    </ParameterSection>
                    <ParameterSection title="Resolution">
                      <FormField
                        control={form.control}
                        name="resolution"
                        render={({ field }) => (
                          <FormItem>
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
                                {resolutionOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value} className="hover:bg-pink-700/10">
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                    </ParameterSection>
                  </div>
                </ParameterDrawer>
              </div>

              {/* --- DESKTOP PARAMETERS (inline) --- */}
              <div className="hidden sm:flex gap-3 items-end">
                <FormField
                  control={form.control}
                  name="aspectRatio"
                  render={({ field }) => (
                    <FormItem className="flex-1 min-w-[120px]">
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
                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem className="flex-1 min-w-[100px]">
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
              </div>

              {/* --- GENERATE BUTTON --- */}
              <Button
                className="w-full sm:w-auto min-w-[120px] shrink-0 relative z-10 bg-gradient-to-r from-pink-700 to-rose-600 hover:from-pink-600 hover:to-rose-500 text-white shadow-lg shadow-pink-700/30 hover:shadow-pink-700/50 transition-all duration-300 rounded-xl font-semibold"
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
            </div>

            {/* --- RESOLUTION (desktop: inline, mobile: in drawer) --- */}
            <div className="hidden sm:flex relative z-10 mt-3">
              <FormField
                control={form.control}
                name="resolution"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-[120px]">
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
                        {resolutionOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="hover:bg-pink-700/10">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </div>

      {/* --- RENDER AREA --- */}
      <div className='space-y-4 sm:space-y-6 mt-4 sm:mt-8 px-4 lg:px-8'>
        <p className="text-sm text-muted-foreground">Videos are saved privately. You can leave this page and return when your video is ready.</p>
        {/* Loading/Status Message */}
        {isLoading && (
          <GenerationLoading
            accent="pink"
            title={getStatusMessage()}
            subtitle="Crafting your cinematic moment 🎬"
          />
        )}

        {/* Error State */}
        {error && <GenerationError message={error} />}

        {/* Idle/Empty State */}
        {status === "idle" && !isLoading && !error && !videoUrl && (
          <GenerationEmpty accent="pink" label={t('empty')} />
        )}

        {/* Completed State */}
        {status === "completed" && videoUrl && (
          <div className="flex flex-col items-center gap-4 sm:gap-6 mt-4 sm:mt-8">
            <VideoResult
              previewUrl={videoUrl}
              downloadUrl={downloadUrl}
              playbackError={playbackError}
              previewAttempt={previewAttempt}
              onPlaybackError={() => setPlaybackError('Video preview unavailable. Try downloading the MP4 or retry the preview.')}
              onPlaybackReady={() => setPlaybackError(null)}
              onRetry={() => { setPlaybackError(null); setPreviewAttempt(attempt => attempt + 1); }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

