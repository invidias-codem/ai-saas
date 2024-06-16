"use client";

import { Input } from '@/components/ui/input';
import { useState, useEffect, SetStateAction } from "react";
import { formSchema } from './constants';
import { Heading } from '@/components/heading';
import { DiscIcon } from '@radix-ui/react-icons';
import { Form, FormField, FormItem, FormControl } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { z } from 'zod';
import EmptyState from '@/components/empty';
import { useMemo } from 'react'; // Assuming React hooks for state management

const MusicPage = () => {
  // Consider removing useRouter if not used for navigation
  const router = useRouter();
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [spectrogramUrl, setSpectrogramUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [spectrogramError, setSpectrogramError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
    },
  });

  const isLoading = form.formState.isSubmitting;

  const handleSubmit = async ({ prompt }: z.infer<typeof formSchema>) => {
    try {
      setMusicUrl(null);
      setSpectrogramUrl(null);
      setAudioError(null);
      setSpectrogramError(null);

      const response = await fetch("/api/music", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status: ${response.status}`);
      }

      const data = await response.json();
      const { audioUrl, spectrogramUrl } = data || {};

      if (audioUrl) {
        // Check for supported audio format (optional)
        // You can use libraries like `audio-metadata` to check format before setting state
        const isSupportedFormat = isAudioSupported(audioUrl); // Implement this function

        if (isSupportedFormat) {
          setMusicUrl(audioUrl);
          setSpectrogramUrl(spectrogramUrl);
          form.reset();
        } else {
          setAudioError("Unsupported audio format generated. Please try again.");
        }
      } else {
        setAudioError("Error generating audio. Please try again."); // Set error message
      }
    } catch (error) {
      if (error instanceof TypeError) {
        setAudioError("Network error occurred. Please try again.");
      } else {
        console.error(error);
        setAudioError("Error generating audio. Please try again.");
      }
    }
  };

  const isAudioSupported = useMemo(() => {
    const audio = new Audio();
    return (format: string) => !!audio.canPlayType(format); // Check for format support
  }, []); // Memoize the audio element creation

  return (
    <div>
      <Heading
        title="Juke Box"
        description='Turn your prompt into a song!'
        icon={DiscIcon}
        iconColor='text-emerald-500'
        bgColor='bg-white-500/10'
      />
      <div className='px-4 lg:px-8'>
        <div>
          <Form {...form}>
            <FormField control={form.control} name="prompt" render={({ field }) => (
              <>
                <Input
                  placeholder="Generate a piano solo..."
                  {...field}
                />
                <Button
                  className='col-span-12 lg:col-span-2 w-full'
                  disabled={isLoading}
                  type="submit"
                  onClick={form.handleSubmit(handleSubmit)}
                >
                  Generate
                </Button>
              </>
            )} />
          </Form>
        </div>
      </div>
      <div className="space-y-4 mt-4">
        {isLoading && (
          <div className='p-8 rounded-lg w-full flex items-center justify-center bg-muted'>
            {/* <Loader className="w-8 h-8 animate-spin" /> */}
          </div>
        )}
        {audioError && (
          <div className="text-red-500">{audioError}</div>
        )}
        {!musicUrl && !isLoading && !audioError && (
          <EmptyState label='No music generated yet' />
        )}
        {musicUrl && (
          <>
            <audio controls className='w-full mt-8'>
              <source src={musicUrl} type="audio/mp3" />
            </audio>
            {spectrogramUrl && (
              <div className='mt-8'>
                <img src={spectrogramUrl} alt="Spectrogram" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MusicPage;





