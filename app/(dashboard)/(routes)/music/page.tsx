// app/(dashboard)/(routes)/music/page.tsx
"use client";

import { Input } from '@/components/ui/input';
import { useState, useEffect } from "react"; // ✅ Added useEffect
import { formSchema } from './constants';
import { Heading } from '@/components/heading';
import { DiscIcon } from '@radix-ui/react-icons';
import { Form, FormField, FormItem, FormControl } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { z } from 'zod';
import EmptyState from '@/components/empty';
import axios from 'axios';

// ✅ Define the structure of the prediction object
interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string; // MusicGen output is a single URL string
  error?: {
    detail: string;
  };
}

const MusicPage = () => {
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ✅ Manage loading and prediction state
  const [isLoading, setIsLoading] = useState(false);
  const [predictionId, setPredictionId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: '',
    },
  });

  // ✅ useEffect hook for polling
  useEffect(() => {
    // Stop polling if there's no ID or we're not loading
    if (!predictionId || !isLoading) {
      return;
    }

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
            // Still working, let the interval continue
            break;
        }
      } catch (err: any) {
        console.error("[MUSIC_POLLING_ERROR]", err);
        setError("Failed to get music status. Please try again.");
        setIsLoading(false);
        setPredictionId(null);
        clearInterval(interval);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval); // Cleanup on unmount

  }, [predictionId, isLoading, form]);

  // ✅ Updated handleSubmit to *start* the prediction
  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    setError(null); 
    setMusicUrl(null);
    setIsLoading(true); // Start loading
    setPredictionId(null); // Clear old ID

    try {
      // ✅ Call the API to start the prediction
      const response = await axios.post<ReplicatePrediction>("/api/music", values);
      const prediction = response.data;

      if (prediction && prediction.id) {
        // ✅ Set the ID to start polling
        setPredictionId(prediction.id);
      } else {
        throw new Error("API response did not contain a prediction ID.");
      }
    } catch (error: any) {
      console.error("[MUSIC_PAGE_ERROR]", error);
      const errorMessage = error.response?.data?.details || "Sorry, something went wrong starting the music generation.";
      setError(errorMessage);
      setIsLoading(false); // Stop loading on immediate failure
    }
  };

  return (
    <div>
      <Heading
        title="Juke Box"
        description='Turn your prompt into a song with Lyria!'
        icon={DiscIcon}
        iconColor='text-emerald-500'
        bgColor='bg-emerald-500/10'
      />
      <div className='px-4 lg:px-8'>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="rounded-lg border w-full p-4 px-3
            md:px-6 focus-within:shadow-sm grid grid-cols-12 gap-2"
          >
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem className='col-span-12 lg:col-span-10'>
                  <FormControl className='m-0 p-0'>
                    <Input
                      className='border-0 outline-none focus-visible:ring-0 focus-visible:ring-transparent'
                      disabled={isLoading} // ✅ Use loading state
                      placeholder="Generate a relaxing lofi beat..."
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              className="col-span-12 lg:col-span-2 w-full"
              disabled={isLoading} // ✅ Use loading state
            >
              Generate
            </Button>
          </form>
        </Form>
      </div>

      <div className='space-y-4 mt-4 px-4 lg:px-8'>
        {isLoading && (
           <div className="p-8 rounded-lg w-full flex items-center justify-center bg-muted">
            <EmptyState label={'Genie is composing your track...'} />
          </div>
        )}
        
        {error && <p className="text-red-500 text-center p-4">{error}</p>}

        {!musicUrl && !isLoading && !error && (
            <EmptyState label={'No music generated yet.'}/>
        )}
        {musicUrl && (
          <audio controls className='w-full mt-8'>
            <source src={musicUrl} type="audio/mpeg" /> 
            Your browser does not support the audio element.
          </audio>
        )}
      </div>
    </div>
  );
};

export default MusicPage;





