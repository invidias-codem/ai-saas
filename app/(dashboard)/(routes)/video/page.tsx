// app/(dashboard)/(routes)/video/page.tsx
"use client";

// ✅ Added useEffect
import { useState, useEffect } from "react";
import { formSchema, resolutionOptions, durationOptions, aspectRatioOptions } from './constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heading } from '@/components/heading';
import { VideoIcon, DownloadIcon } from "@radix-ui/react-icons";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormControl } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { z } from 'zod';
import EmptyState from '@/components/empty';
import axios from 'axios';

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

  }, [predictionId, status, form]); // Dependencies for the hook


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

  return (
    <div>
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
            className="rounded-lg border w-full p-4 px-3 md:px-6 focus-within:shadow-sm grid grid-cols-12 gap-2"
          >
            {/* --- PROMPT FIELD --- */}
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem className='col-span-12 lg:col-span-6'>
                  <FormControl className='m-0 p-0'>
                    <Input
                      className='border-0 outline-none focus-visible:ring-0 focus-visible:ring-transparent'
                      disabled={isLoading}
                      placeholder="e.g., A drone flying over a futuristic city at sunset"
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
                <FormItem className="col-span-6 md:col-span-3 lg:col-span-2">
                  <Select
                    disabled={isLoading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {aspectRatioOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
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
                <FormItem className="col-span-6 md:col-span-3 lg:col-span-2">
                  <Select
                    disabled={isLoading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {durationOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
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
              className="col-span-12 lg:col-span-2 w-full"
              type="submit"
              disabled={isLoading}
            >
              Generate
            </Button>
          </form>
        </Form>
      </div>

      {/* --- RENDER AREA (This logic remains the same as it's driven by 'status') --- */}
      <div className='space-y-4 mt-4 px-4 lg:px-8'>
        {/* Loading/Status Message */}
        {isLoading && (
           <div className="p-8 rounded-lg w-full flex items-center justify-center bg-muted">
            <EmptyState label={getStatusMessage()} />
          </div>
        )}

        {/* Error State */}
        {error && <p className="text-red-500 text-center p-4">{error}</p>}

        {/* Idle/Empty State */}
        {status === "idle" && !isLoading && !error && !videoUrl && (
            <EmptyState label={getStatusMessage()}/>
        )}

        {/* Completed State */}
        {status === "completed" && videoUrl && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <div className="w-full max-w-2xl">
              <video
                controls
                controlsList="nodownload noremoteplayback"
                className="w-full rounded-lg shadow-md mb-2"
                src={videoUrl}
              >
                Your browser does not support the video tag.
              </video>
              <a
                href={videoUrl}
                download={`genie-video-${Date.now()}.mp4`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 w-full"
              >
                <DownloadIcon className="mr-2 h-4 w-4" /> Download Video
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPage;