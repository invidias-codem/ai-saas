"use client";

import { useState, useEffect, useRef } from "react";
// Import new constants and UI components
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

// ... (interfaces remain the same) ...
interface VideoStatusResult {
  gcsUri?: string;
  mimeType?: string;
}
interface VideoDisplayResult {
  signedUrl: string;
  originalGcsUri: string;
}

const VideoPage = () => {
  // ... (state hooks remain the same) ...
  const [operationName, setOperationName] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "polling" | "completed" | "failed">("idle");
  const [videos, setVideos] = useState<VideoDisplayResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: '',
      aspectRatio: "16:9",
      duration: "4",
      resolution: "720p",
    },
  });

  const isLoading = status === "starting" || status === "polling";

  // ... (fetchSignedUrls, checkStatus, useEffects, onSubmit, getStatusMessage remain the same) ...
   // Function to fetch signed URLs
   const fetchSignedUrls = async (gcsUris: string[]) => {
    try {
      const signedUrlPromises = gcsUris.map(gcsUri =>
        axios.post('/api/video/signed-url', { gcsUri })
      );
      const responses = await Promise.all(signedUrlPromises);

      const signedUrlsData: VideoDisplayResult[] = responses.map((response, index) => ({
        signedUrl: response.data.signedUrl,
        originalGcsUri: gcsUris[index],
      }));

      setVideos(signedUrlsData);
      setError(null);

    } catch (err: any) {
        console.error("Error fetching signed URLs:", err);
        setError(err.response?.data?.details || "Failed to load generated videos.");
        setVideos([]);
        setStatus("failed");
    }
  };


  // Function to check operation status
  const checkStatus = async (opName: string) => {
    try {
      console.log(`Polling status for ${opName}...`);
      const response = await axios.get(`/api/video/status?operationName=${opName}`);
      const data = response.data;

      if (data.status === "completed") {
        setStatus("completed");
        setError(null);
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setOperationName(null);

        const results: VideoStatusResult[] = data.videos || [];
        const gcsUrisToFetch = results.map(v => v.gcsUri).filter((uri): uri is string => !!uri);

        if (gcsUrisToFetch.length > 0) {
            console.log("Generation complete, fetching signed URLs for:", gcsUrisToFetch);
            await fetchSignedUrls(gcsUrisToFetch);
        } else {
             console.warn("Generation completed, but no GCS URIs found.");
             setError("Generation finished, but couldn't find the video file details.");
             setStatus("failed");
             setVideos([]);
        }

      } else if (data.status === "failed") {
        setStatus("failed");
        setError(data.error || "Video generation failed.");
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setOperationName(null);
      } else {
        setStatus("polling");
      }
    } catch (err: any) {
      console.error("Error polling status:", err);
      setError(err.response?.data?.details || "Failed to check video status.");
      setStatus("failed");
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      setOperationName(null);
    }
  };

  // Effect to clean up interval on unmount
  useEffect(() => {
    return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
  }, []);

  // Effect to start/stop polling based on status and operationName
  useEffect(() => {
    if (operationName && status === 'polling') {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = setInterval(() => {
        if (operationName) checkStatus(operationName);
      }, 7000); // Poll every 7 seconds
    } else if (status !== 'polling' && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
     // Cleanup on unmount or when dependencies change
     return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
  }, [operationName, status]); // Re-run effect if operationName or status changes

  // Form submission handler
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setError(null);
    setStatus("starting");
    setVideos([]);
    setOperationName(null);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    try {
      const response = await axios.post("/api/video", values);
      const opName = response.data.operationName;
      if (opName) {
        setOperationName(opName);
        setStatus("polling"); // Immediately start polling
      } else {
         throw new Error("API did not return an operation name.");
      }
      form.reset();
    } catch (err: any) {
      console.error("[VIDEO_PAGE_SUBMIT_ERROR]", err);
      setError(err.response?.data?.details || "Failed to start video generation.");
      setStatus("failed");
    }
  };

   // Helper function for status messages
   const getStatusMessage = (): string => {
    switch (status) {
      case "starting": return "Warming up the magic lamp...";
      case "polling": return "Genie is creating your video, please wait...";
      case "completed": return videos.length > 0 ? "Your video is ready!" : "Generation completed, but no video data found.";
      case "failed": return "Video generation failed."; // Error message is shown separately
      default: return "Generate a video based on your prompt."; // Idle message
    }
  };


  return (
    <div>
      <Heading
        title="Quick Clip"
        description="Generate videos with Veo 3!"
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
                        {/* ✅ REMOVED placeholder prop */}
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
                         {/* ✅ REMOVED placeholder prop */}
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

      {/* --- RENDER AREA (No changes needed here) --- */}
      <div className='space-y-4 mt-4 px-4 lg:px-8'>
        {(isLoading || status === 'completed' || status === 'failed') && !error && (
           <div className="p-8 rounded-lg w-full flex items-center justify-center bg-muted">
            <EmptyState label={getStatusMessage()} />
          </div>
        )}
        {error && <p className="text-red-500 text-center p-4">{error}</p>}
        {status === "idle" && !isLoading && !error && videos.length === 0 && (
            <EmptyState label={getStatusMessage()}/>
        )}
        {status === "completed" && videos.length > 0 && (
          <div className="flex flex-col items-center gap-6 mt-8">
            {videos.map((video) => (
              <div key={video.originalGcsUri} className="w-full max-w-2xl">
                <video
                  controls
                  className="w-full rounded-lg shadow-md mb-2"
                  src={video.signedUrl}
                >
                  Your browser does not support the video tag.
                </video>
                <a
                  href={video.signedUrl}
                  download={`genie-video-${Date.now()}.mp4`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 w-full"
                >
                  <DownloadIcon className="mr-2 h-4 w-4" /> Download Video
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPage;