// app/(dashboard)/(routes)/image/page.tsx
"use client";

import * as z from "zod";
import axios from "axios";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DownloadIcon, ImageIcon } from "@radix-ui/react-icons";
import Image from "next/image";

import { Heading } from "@/components/heading";
import { KoFiNudge } from "@/components/kofi-nudge";
import { useSupportNudge } from "@/hooks/use-support-nudge";
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
import { amountOptions, resolutionOptions, modelOptions, formSchema } from "./constants";
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
  const [selectedModel, setSelectedModel] = useState<string>("flux-schnell");

  // Load saved model preference from API (server-side settings)
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await axios.get("/api/user/settings");
        if (response.data?.preferred_image_model) {
          setSelectedModel(response.data.preferred_image_model);
        }
      } catch (error) {
        // Fallback to localStorage if API fails or offline
        const localModel = localStorage.getItem("preferredImageModel");
        if (localModel) setSelectedModel(localModel);
      }
    };
    fetchSettings();
  }, []);

  const t = useTranslations("Image");
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
      amount: "1",
      resolution: "1:1",
      model: selectedModel,
    },
  });

  // Update form when selected model changes
  useEffect(() => {
    form.setValue("model", selectedModel);
  }, [selectedModel, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setError(null);
    setIsLoading(true);
    setImages([]);

    try {
      // Save model preference to DB and LocalStorage
      if (values.model) {
        localStorage.setItem("preferredImageModel", values.model);
        // Fire and forget setting update
        axios.post("/api/user/settings", { preferred_image_model: values.model }).catch(err => console.error("Failed to save setting", err));
      }

      // Call new API that returns images directly
      const response = await axios.post<{ images: string[]; model: string }>("/api/image", values);

      setImages(response.data.images);
      console.log(`[IMAGE_PAGE] Generated ${response.data.images.length} images with ${response.data.model}`);
      trackActivity("image");

      form.reset();
    } catch (error: any) {
      console.error("[IMAGE_PAGE_ERROR]", error);

      // Handle errors
      if (error.response?.data?.details?.fieldErrors?.resolution) {
        setError(`Invalid resolution: ${error.response.data.details.fieldErrors.resolution[0]}`);
      } else {
        const backendError = error.response?.data?.error;
        const backendDetails = error.response?.data?.details;

        if (backendError === "Unauthorized") {
          setError("You do not have permission to generate images. Please ensure you are logged in.");
        } else if (backendDetails) {
          setError(`Error: ${backendDetails}`);
        } else {
          setError(backendError || "Sorry, something went wrong generating the image.");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Nudge Integration
  const { showNudge, trackActivity, dismissNudge } = useSupportNudge();

  return (
    <div>
      <KoFiNudge isOpen={showNudge} onClose={dismissNudge} />
      <Heading
        title={t('title')}
        description={t('description')}
        icon={ImageIcon}
        iconColor="text-violet-500"
        bgColor="bg-violet-500/10"
      />
      <div className="px-4 lg:px-8">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="relative rounded-2xl border border-violet-500/20 bg-gradient-to-br from-background via-background to-violet-500/5 backdrop-blur-xl w-full p-6 shadow-2xl shadow-violet-500/10 hover:shadow-violet-500/20 transition-all duration-300 flex flex-col md:flex-row flex-wrap gap-4 items-end"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-transparent to-purple-500/5 rounded-2xl pointer-events-none" />
            <FormField
              name="prompt"
              render={({ field }) => (
                <FormItem className="w-full lg:flex-1 relative z-10">
                  <FormControl className="m-0 p-0">
                    <Input
                      className="border-0 bg-background/50 backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 rounded-xl px-4 py-3 transition-all duration-200"
                      disabled={isLoading}
                      placeholder="✨ Describe your vision... (e.g., Alpacas in the style of Picasso)"
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
                <FormItem className="flex-1 lg:flex-none min-w-[120px] relative z-10">
                  <Select
                    disabled={isLoading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background/50 backdrop-blur-sm border-violet-500/20 rounded-xl hover:border-violet-500/40 transition-colors">
                        <SelectValue defaultValue={field.value} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-background/95 backdrop-blur-xl border-violet-500/20">
                      {amountOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="hover:bg-violet-500/10">
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
                <FormItem className="flex-1 lg:flex-none min-w-[120px] relative z-10">
                  <Select
                    disabled={isLoading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background/50 backdrop-blur-sm border-violet-500/20 rounded-xl hover:border-violet-500/40 transition-colors">
                        <SelectValue defaultValue={field.value} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-background/95 backdrop-blur-xl border-violet-500/20">
                      {resolutionOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="hover:bg-violet-500/10">
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
              name="model"
              render={({ field }) => (
                <FormItem className="flex-1 lg:flex-none min-w-[180px] relative z-10">
                  <Select
                    disabled={isLoading}
                    onValueChange={(value) => {
                      field.onChange(value);
                      setSelectedModel(value);
                    }}
                    value={field.value || selectedModel}
                    defaultValue={field.value || selectedModel}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background/50 backdrop-blur-sm border-violet-500/20 rounded-xl hover:border-violet-500/40 transition-colors">
                        <SelectValue defaultValue={field.value || selectedModel} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-background/95 backdrop-blur-xl border-violet-500/20">
                      {modelOptions.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className="hover:bg-violet-500/10"
                        >
                          <div className="flex items-center gap-2">
                            <span>{option.label}</span>
                            {option.badge && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400">
                                {option.badge}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <Button
              className="w-full md:w-auto min-w-[120px] relative z-10 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all duration-300 rounded-xl font-semibold"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </span>
              ) : (
                "✨ Generate"
              )}
            </Button>
          </form>
        </Form>
      </div>

      {/* Output Area */}
      <div className="space-y-6 mt-8 px-4 lg:px-8">
        {isLoading && (
          <div className="relative rounded-2xl border border-violet-500/20 bg-gradient-to-br from-background to-violet-500/5 p-16 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-violet-500/10 animate-pulse" />
            <div className="relative flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-violet-500/30 blur-xl rounded-full animate-pulse" />
                <div className="relative h-16 w-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-lg font-semibold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
                  Creating your masterpiece...
                </p>
                <p className="text-sm text-muted-foreground">
                  AI is painting your vision into reality ✨
                </p>
              </div>
            </div>
          </div>
        )}
        {error && !isLoading && (
          <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-background to-red-500/5 p-8">
            <EmptyState label={error} />
          </div>
        )}
        {images.length === 0 && !isLoading && !error && (
          <div className="rounded-2xl border border-violet-500/10 bg-gradient-to-br from-background to-violet-500/5 p-12">
            <EmptyState label={t('empty')} />
          </div>
        )}
        {images.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
            {images.map((src, index) => (
              <Card key={src} className="group relative rounded-2xl overflow-hidden border border-violet-500/10 bg-gradient-to-br from-background to-violet-500/5 hover:border-violet-500/30 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-violet-500/20">
                <div className="relative aspect-square overflow-hidden">
                  <Image
                    alt="Generated Image"
                    fill
                    src={src}
                    unoptimized
                    className="object-cover transition-transform duration-700 group-hover:scale-110 select-auto pointer-events-auto" style={{ pointerEvents: "auto", userSelect: "auto" }}
                  />
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  {/* Share button overlay - appears on hover */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 pointer-events-none">
                    <ShareIconButton
                      content={{
                        title: "AI Generated Image by Genie",
                        text: `Check out this AI-generated image I created with Genie! 🎨`,
                        url: src,
                      }}
                      className="bg-background/90 backdrop-blur-md shadow-lg border-violet-500/20 hover:bg-background hover:scale-110 transition-all pointer-events-auto"
                    />
                  </div>
                </div>
                <CardFooter className="p-3 gap-2 bg-background/50 backdrop-blur-sm">
                  <Button
                    onClick={async () => {
                      try {
                        const response = await fetch(src);
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `genie-image-${Date.now()}.png`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(url);
                      } catch (err) {
                        console.error("Download failed:", err);
                        window.open(src, "_blank");
                      }
                    }}
                    variant="secondary"
                    className="flex-1 bg-gradient-to-r from-violet-600/10 to-purple-600/10 hover:from-violet-600/20 hover:to-purple-600/20 border-violet-500/20 rounded-xl transition-all duration-300"
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
                    className="md:hidden bg-background/90 backdrop-blur-md border-violet-500/20"
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
