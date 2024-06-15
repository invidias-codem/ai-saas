"use client"

import Vision from '@google-cloud/vision';
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Heading } from "@/components/heading";
import { DownloadIcon, ImageIcon } from "@radix-ui/react-icons";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Key, useState } from "react";
import { Empty } from "@/components/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { amountOptions, resolutionOptions, formSchema } from "./constants";
import { Card, CardFooter } from "@/components/ui/card";
import Image from "next/image";
import { NextRequest, NextResponse } from "next/server";
import dotenv from 'dotenv';
import { fetch } from "openai/_shims/index.mjs";
import { toBase64 } from "openai/core.mjs";
import { url } from "inspector";


dotenv.config();
const client = new Vision.ImageAnnotatorClient();
const ImagePage = () => {
    const router = useRouter();
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const { register, handleSubmit, reset } = useForm<z.infer<typeof formSchema>>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        prompt: "",
        amount: "",
        resolution: "",
      },
    });
    const isLoading = false;

    const onSubmit = async (formData: z.infer<typeof formSchema>) => {
      try {
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          throw new Error("Google Application Credentials not found");
        }
        if (!process.env.NEXT_PUBLIC_OUTPUT_URI) {
          throw new Error("Output URI not found");
        }
        const vision = require("@google-cloud/vision")({
          apiEndpoint: process.env.API_ENDPOINT,
          credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
          keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        });
        if (
          !(
            formData.prompt &&
            formData.amount &&
            formData.resolution &&
            formData.prompt.length > 0 &&
            parseInt(formData.amount) > 0 &&
            formData.resolution.split("x").length === 2
          )
        ) {
          throw new Error(
            "Prompt, amount, or resolution is missing or incorrect format"
          );
        }
        const imageGenerationConfig = {
          prompt: formData.prompt,
          numberOfImages: parseInt(formData.amount),
          imageResolution: `${formData.resolution.split("x")[0]}x${
            formData.resolution.split("x")[1]
          }`,
          model: "image-alpha-001",
          outputConfig: {
            outputLocation: {
              outputUri: process.env.NEXT_PUBLIC_OUTPUT_URI,
            },
            outputFormat: "URL",
          },
        };
        const request = {
          image: {
            content: formData.prompt,
          },
          features: [
            {
              type: "IMAGE_GENERATION",
              imageGenerationConfig,
            },
          ],
        };
        const [response] = await vision.annotate(request);
        const imageUrls = response.imageGenerationAnnotation?.imageUrls || [];
        setGeneratedImages(imageUrls);
        reset();
      } catch (error) {
        console.error("Error generating images:", error);
      } finally {
        router.refresh();
      }
    };


    return (
      <div>
        <Heading 
           title="Image Capsule"
           description="Try our Image Generator"
           icon={ImageIcon}
           iconColor="text-violet-500"
           bgColor="bg-violet-500/10"
        />
        <div className="px-4 lg:px-8 grid grid-template-rows: auto 1fr">
          <FormField name="resolution">
            {({ field, fieldState }) => (
              <Select
                disabled={isLoading}
                {...field}
                error={fieldState.error?.message}
                defaultValue={resolutionOptions.find((option) => option.value === field.value)?.label}
              >
                <SelectContent>
                  {resolutionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <div className="space-y-4 mt-4">
            {generatedImages.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-8">
                {generatedImages.map((imageUrl) => (
                  <Card key={imageUrl} className="rounded-lg overflow-hidden">
                    <div className="relative aspect-square">
                      <Image alt="Image" fill src={imageUrl} />
                    </div>
                    <CardFooter className="p-2">
                      <Button onClick={() => window.open(imageUrl)} variant="secondary" className="w-full">
                        <DownloadIcon className="h-4 w-4 mr-2" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
};

export default ImagePage;