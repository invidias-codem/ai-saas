"use client"

import { OpenAI } from "openai";
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

const ImagePage = () => {
    const router = useRouter();
    const [images, setImages] = useState<string[]>([]);
  
    const form = useForm<z.infer<typeof formSchema>>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        prompt: "",
        amount: "1",
        resolution: "512x512",
      },
    });
  
    const isLoading = form.formState.isSubmitting;
  
    const onSubmit = async (values: z.infer<typeof formSchema>) => {
      try {
        setImages([]);
  
        // Construct API URL
        const url = `https://api.openai.com/v1/images/generations`;
  
        // Prepare Authorization Header (Ensure correct key and format)
        const apiKey = process.env.OPENAI_API_KEY;
        const authorizationHeader = `Bearer ${apiKey}`; // Double-check this line
  
        // Prepare Request Body
        const body = JSON.stringify({
          model:"dall-e-3", // Replace with desired image generation model
          prompt: values.prompt,
          n: parseInt(values.amount, 10),
          size: "1024x1024",
          response_format: "url",
        });
  
        // Make API Call using fetch
        const response = await fetch([url], {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authorizationHeader,
          },
          body: body,
        });

  
        if (!response) {
          throw new Error(`API request failed with status ${response}`);
        }
  
        const data = await response.json();
  
        // Extract Image URLs (handle potential missing data)
        const imageUrls = data.data?.map((image: { url: string }) => image.url);
  
        // Update state with image URLs (if on a server-side render)
        if (typeof window === "undefined") {
          // Server-side render (SSR)
          return NextResponse.json(imageUrls); // Return image URLs for SSR
        } else {
          // Client-side render (CSR)
          setImages(imageUrls); // Update state for CSR
        }
  
        form.reset();
      } catch (error) {
        console.error("Error generating images:", error);
        // TODO: Implement proper error handling (e.g., display user-friendly message)
      } finally {
        router.refresh(); // This might not be necessary depending on your implementation
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
                <div>
                    <Form {...form}>
                        <form 
                            onSubmit={form.handleSubmit(onSubmit)}
                            className="
                                rounded-lg
                                border
                                w-absolute 
                                p-4
                                px-3
                                md:px-6
                                focus-within:shadow-sm
                                grid
                                grid-cols-12
                                gap-2
                                position: absolute; bottom: 0;
                            "
                        >
                            <FormField 
                                name="prompt"
                                render={({ field }) => (
                                    <FormItem className="col-span-12 lg:col-span-6">
                                        <FormControl className="me-0 p-0">
                                            <Input 
                                                className="border-0 outline-none
                                                focus-visible:ring-0
                                                focus-visible:ring-transparent"
                                                disabled={isLoading}
                                                placeholder="Alpacas climbing Pikes Peak"
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
                                                    <SelectItem
                                                        key={option.value}
                                                        value={option.value}
                                                    >
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
                                                    <SelectItem
                                                        key={option.value}
                                                        value={option.value}
                                                    >
                                                      {option.label}  
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                            <Button className="col-span-12 lg:col-span-2 w-full"
                            disabled={isLoading}>
                                Vend
                            </Button>
                        </form>
                    </Form>
                </div>
                <div className="space-y-4 mt-4">
  {/* Check if images state has URLs and not loading */}
  {images && images.length > 0 && !isLoading && (
    <div className="grid grid-cls-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-8">
      {/* Loop through image URLs */}
      {images.map((imageUrl) => (
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
}

export default ImagePage;