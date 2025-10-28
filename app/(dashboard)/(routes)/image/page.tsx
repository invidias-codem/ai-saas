// app/(dashboard)/(routes)/image/page.tsx
"use client";

import * as z from "zod";
import axios from "axios";
import { useState, useEffect } from "react"; // ✅ Added useEffect
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DownloadIcon, ImageIcon } from "@radix-ui/react-icons";

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
import { Card } from "@/components/ui/card";
import { amountOptions, resolutionOptions, formSchema } from "./constants";

// ✅ Define the structure of the prediction object
interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string[]; // The output for this model is an array of image URLs
  error?: {
    detail: string;
  };
}

const ImagePage = () => {
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // ✅ Manage loading state for polling
  const [isLoading, setIsLoading] = useState(false);
  const [predictionId, setPredictionId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
      amount: "1",
      resolution: resolutionOptions[0].value,
    },
  });

  // ✅ useEffect hook for polling the prediction status
  useEffect(() => {
    // Stop polling if there's no prediction ID
    if (!predictionId) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await axios.get<ReplicatePrediction>(`/api/image/predictions/${predictionId}`);
        const prediction = response.data;

        switch (prediction.status) {
          case "succeeded":
            if (prediction.output && Array.isArray(prediction.output)) {
              setImages(prediction.output);
            }
            setIsLoading(false);
            setPredictionId(null);
            form.reset(); // Reset form on success
            clearInterval(interval);
            break;
          
          case "failed":
          case "canceled":
            setError(prediction.error?.detail || "Image generation failed.");
            setIsLoading(false);
            setPredictionId(null);
            clearInterval(interval);
            break;
          
          case "starting":
          case "processing":
            // Still generating, do nothing and let the interval continue
            break;
        }
      } catch (err: any) {
        console.error("[IMAGE_POLLING_ERROR]", err);
        setError("Failed to get image status. Please try again.");
        setIsLoading(false);
        setPredictionId(null);
        clearInterval(interval);
      }
    }, 3000); // Poll every 3 seconds

    // Cleanup function
    return () => clearInterval(interval);

  }, [predictionId, form]); // Dependencies for the hook

  
  // ✅ Updated onSubmit to *start* the prediction
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setError(null);
    setImages([]); 
    setIsLoading(true); // Set loading to true
    setPredictionId(null); // Clear old ID

    try {
      // ✅ Call the API to start the prediction
      const response = await axios.post<ReplicatePrediction>("/api/image", values);
      const prediction = response.data;

      if (prediction && prediction.id) {
        // ✅ Set the prediction ID to start polling
        setPredictionId(prediction.id);
      } else {
        throw new Error("API response did not contain a prediction ID.");
      }
    } catch (error: any) {
      console.error("[IMAGE_PAGE_ERROR]", error);
      const errorMessage = error.response?.data?.details || "Sorry, something went wrong starting the image generation.";
      setError(errorMessage);
      setIsLoading(false); // Stop loading on immediate failure
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
            {/* Prompt Input */}
            <FormField
              name="prompt"
              render={({ field }) => (
                <FormItem className="col-span-12 lg:col-span-6">
                  <FormControl className="m-0 p-0">
                    <Input
                      className="border-0 outline-none focus-visible:ring-0 focus-visible:ring-transparent"
                      disabled={isLoading} // ✅ Use isLoading state
                      placeholder="Alpacas in the style of Picasso"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Amount Select */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem className="col-span-12 lg:col-span-2">
                  <Select
                    disabled={isLoading} // ✅ Use isLoading state
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Amount" />
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

            {/* Resolution Select */}
            <FormField
              control={form.control}
              name="resolution"
              render={({ field }) => (
                <FormItem className="col-span-12 lg:col-span-2">
                  <Select
                    disabled={isLoading} // ✅ Use isLoading state
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Resolution" />
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

            {/* Submit Button */}
            <Button
              className="col-span-12 lg:col-span-2 w-full"
              type="submit"
              disabled={isLoading} // ✅ Use isLoading state
            >
              Generate
            </Button>
          </form>
        </Form>
      </div>

      {/* Output Area */}
      <div className="space-y-4 mt-4 px-4 lg:px-8">
        {/* Loading State */}
        {isLoading && ( // ✅ Use isLoading state
          <div className="p-8 rounded-lg w-full flex items-center justify-center bg-muted">
            <EmptyState label={"Genie is creating your masterpiece..."} />
          </div>
        )}

        {/* Error State */}
        {error && <p className="text-red-500 text-center p-4">{error}</p>}

        {/* Empty State */}
        {images.length === 0 && !isLoading && !error && (
          <EmptyState label="No images generated yet." />
        )}

        {/* Image Grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-8">
            {images.map((src, index) => (
              <Card
                key={src.substring(0, 50)} 
                className="rounded-lg overflow-hidden"
              >
                <div className="relative aspect-square">
                  <img
                    src={src}
                    alt="Generated Image"
                    className="object-cover w-full h-full"
                  />
                </div>
                <div className="p-2">
                  <a
                    href={src}
                    download={`genie-image-${index + 1}.png`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-full px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
                  >
                    <DownloadIcon className="mr-1 h-3 w-3" />
                    Download
                  </a>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePage;


