"use client";

import { Input } from '@/components/ui/input';
import { useState } from "react"; // Removed useEffect
import { formSchema } from './constants';
import { Heading } from '@/components/heading';
import { DiscIcon } from '@radix-ui/react-icons';
import { Form, FormField, FormItem, FormControl } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
// Removed useRouter as it's not used
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { z } from 'zod';
import EmptyState from '@/components/empty';
import axios from 'axios';

const MusicPage = () => {
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  // Removed spectrogram state as Lyria API might not provide it
  // const [spectrogramUrl, setSpectrogramUrl] = useState<string | null>(null);
  
  // ✅ Add error state
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: '',
    },
  });

  const isLoading = form.formState.isSubmitting;

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    setError(null); // Clear previous errors
    setMusicUrl(null); // Clear previous music
    try {
      const response = await axios.post("/api/music", values);
      // ✅ Assumes the API correctly returns { audio: "url" }
      setMusicUrl(response.data.audio); 
      form.reset();
    } catch (error: any) { // ✅ Add type :any
      console.error("[MUSIC_PAGE_ERROR]", error);
       // ✅ Added detailed error handling
      if (error.response && error.response.data && error.response.data.details) {
        setError(`Sorry, something went wrong: ${error.response.data.details}`);
      } else {
        setError("Sorry, something went wrong generating the music. Please try again.");
      }
    }
    // No finally block needed here
  };

  return (
    <div>
      <Heading
        title="Juke Box"
        description='Turn your prompt into a song with Lyria!' // Updated description
        icon={DiscIcon}
        iconColor='text-emerald-500' // Changed from violet back to emerald? Keep consistent
        bgColor='bg-emerald-500/10' // Match icon color
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
                      disabled={isLoading}
                      placeholder="Generate a relaxing lofi beat..." // Updated placeholder
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              className="col-span-12 lg:col-span-2 w-full"
              disabled={isLoading}
            >
              Generate
            </Button>
          </form>
        </Form>
      </div>

      <div className='space-y-4 mt-4 px-4 lg:px-8'> {/* Added padding */}
        {isLoading && (
          // Use consistent loading state display
           <div className="p-8 rounded-lg w-full flex items-center justify-center bg-muted">
            <EmptyState label={'Genie is composing your track...'} />
          </div>
        )}
         {/* ✅ Display error message */}
        {error && <p className="text-red-500 text-center p-4">{error}</p>}

        {!musicUrl && !isLoading && !error && ( // Check error state too
            <EmptyState label={'No music generated yet.'}/>
        )}
        {musicUrl && (
          <audio controls className='w-full mt-8'>
            {/* ✅ src will be set to the URL from the API response */}
            <source src={musicUrl} type="audio/mpeg" /> 
            Your browser does not support the audio element.
          </audio>
        )}
         {/* Removed spectrogram img tag */}
      </div>
    </div>
  );
};

export default MusicPage;





