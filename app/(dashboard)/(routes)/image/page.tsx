// app/(dashboard)/(routes)/image/page.tsx
"use client";

import * as z from "zod";
import axios from "axios";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DownloadIcon, ImageIcon } from "@radix-ui/react-icons";
import Image from "next/image";

import { Heading } from "@/components/heading";
import { Form, FormField, FormItem, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardFooter } from "@/components/ui/card";
import { amountOptions, resolutionOptions, formSchema } from "./constants";
import { ShareIconButton } from "@/components/share-button";

// Interface for a single Replicate prediction
interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[]; // nano-banana output can be string or array of strings
  error?: {
    detail?: string;
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ImagePage = () => {
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [predictionIds, setPredictionIds] = useState<string[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
      amount: "1",
      resolution: "1:1",
    },
  });

  // Polling effect for multiple predictions
  useEffect(() => {
    if (predictionIds.length === 0 || !isLoading) {
      return;
    }

    const pollPredictions = async () => {
      const newImages: string[] = [];
      let allDone = true;
      let pollError: string | null = null;

      for (const id of predictionIds) {
        try {
          const response = await axios.get(`/api/image/predictions/${id}`);
          const prediction: ReplicatePrediction = response.data;

          if (prediction.status === "succeeded" && prediction.output) {
            // ✅ Correctly handle array output from nano-bana
            if (Array.isArray(prediction.output)) {
              newImages.push(...prediction.output);
            } else {
              newImages.push(prediction.output);
            }
          } else if (prediction.status === "failed" || prediction.status === "canceled") {
            pollError = prediction.error?.detail || "A prediction failed.";
            allDone = true;
            break;
          } else {
            allDone = false; // At least one is still processing
          }
        } catch (err: any) {
          console.error(`Polling error for prediction ${id}:`, err);
          pollError = err.response?.data?.error || "Failed to poll prediction status.";
          allDone = true;
          break;
        }
      }

      if (pollError) {
        setError(pollError);
        setIsLoading(false);
        setPredictionIds([]);
      } else if (allDone) {
        setImages(prev => [...prev, ...newImages].filter((url): url is string => !!url));
        setIsLoading(false);
        setPredictionIds([]);
        form.reset();
      } else {
        // Continue polling
        await sleep(3000);
        pollPredictions();
      }
    };

    pollPredictions();
  }, [predictionIds, isLoading, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setError(null);
    setIsLoading(true);
    setImages([]);
    setPredictionIds([]); // Clear previous IDs

    try {
      // ✅ Corrected API endpoint to /api/image
      const response = await axios.post<ReplicatePrediction[]>("/api/image", values);
      
      const ids = response.data.map(p => p.id);
      setPredictionIds(ids);

    } catch (error: any) {
      console.error("[IMAGE_PAGE_ERROR]", error);
      // ✅ Handle complex error objects from the backend
      if (error.response?.data?.details?.fieldErrors?.resolution) {
        setError(`Invalid resolution: ${error.response.data.details.fieldErrors.resolution[0]}`);
      } else {
        const errorMessage = error.response?.data?.details || error.response?.data?.error || "Sorry, something went wrong starting the image generation.";
        setError(errorMessage);
      }
      setIsLoading(false);
    }
  };

  return (
    <div>
      <Heading
        title="Image Capsule"
        description="Turn your prompt into an image with Seedream 4!"
        icon={ImageIcon}
        iconColor="text-violet-500"
        bgColor="bg-violet-500/10"
      />
      <div className="px-4 lg:px-8">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="rounded-lg border w-full p-4 px-3 md:px-6 focus-within:shadow-sm grid grid-cols-12 gap-2"
          >
            <FormField
              name="prompt"
              render={({ field }) => (
                <FormItem className="col-span-12 lg:col-span-6">
                  <FormControl className="m-0 p-0">
                    <Input
                      className="border-0 outline-none focus-visible:ring-0 focus-visible:ring-transparent"
                      disabled={isLoading}
                      placeholder="Alpacas in the style of Picasso"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem className="col-span-12 lg:col-span-2">
                  <Select
                    disabled={isLoading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue defaultValue={field.value} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {amountOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="resolution"
              render={({ field }) => (
                <FormItem className="col-span-12 lg:col-span-2">
                  <Select
                    disabled={isLoading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue defaultValue={field.value} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {resolutionOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
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

      {/* Output Area */}
      <div className="space-y-4 mt-4 px-4 lg:px-8">
        {isLoading && (
          <div className="p-20">
            <div className="flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500" />
              <p className="text-sm text-muted-foreground mt-2">
                AI is thinking...
              </p>
            </div>
          </div>
        )}
        {error && !isLoading && (
           <EmptyState label={error} />
        )}
        {images.length === 0 && !isLoading && !error && (
          <EmptyState label="No images generated yet." />
        )}
        {images.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-8">
            {images.map((src, index) => (
              <Card key={src} className="rounded-lg overflow-hidden group">
                <div className="relative aspect-square">
                  <Image alt="Generated Image" fill src={src} />
                  {/* Share button overlay - appears on hover */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ShareIconButton
                      content={{
                        title: "AI Generated Image by Genie",
                        text: `Check out this AI-generated image I created with Genie! 🎨`,
                        url: src,
                      }}
                      className="bg-background/80 backdrop-blur-sm shadow-sm border"
                    />
                  </div>
                </div>
                <CardFooter className="p-2 gap-2">
                  <Button
                    onClick={() => window.open(src)}
                    variant="secondary"
                    className="flex-1"
                  >
                    <DownloadIcon className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <ShareIconButton
                    content={{
                      title: "AI Generated Image by Genie",
                      text: `Check out this AI-generated image I created with Genie! 🎨`,
                      url: src,
                    }}
                    className="md:hidden" // Show on mobile, hide on desktop (hover works there)
                  />
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePage;
