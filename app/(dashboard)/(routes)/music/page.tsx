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
import axios from 'axios';

const MusicPage = () => {
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [spectrogramUrl, setSpectrogramUrl] = useState<string | null>(null);
  const router = useRouter();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: '',
    },
  });

  const isLoading = form.formState.isSubmitting;

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setMusicUrl(null); // Clear previous music on submit

      const response = await axios.post("/api/music", values);
      setMusicUrl(response.data.audio);
      form.reset();
    } catch (error) {
      console.error(error);
    }
  };

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
                      placeholder="Generate a piano solo..."
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

      <div className='space-y-4 mt-4'>
        {isLoading && <EmptyState label={'Generating music'} />}
        {musicUrl && ( // Check for non-null musicUrl
          <>
            <audio controls className='w-full mt-8'>
              <source src={musicUrl} type="audio/mpeg" />
            </audio>
            {spectrogramUrl && (
              <img src={spectrogramUrl} typeof='image/jpeg' alt="Spectrogram Visualization" className="w-full mt-4" />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MusicPage;





