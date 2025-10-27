"use client";

import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Heading } from "@/components/heading";
import { ImageIcon } from "@radix-ui/react-icons";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// Removed useRouter as it wasn't being used
import { useState } from "react";
import EmptyState from "@/components/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { amountOptions, resolutionOptions, formSchema } from "./constants";
import axios from "axios";
import { Card } from "@/components/ui/card";

const ImagePage = () => {
  const [images, setImages] = useState<string[]>([]);
  // ✅ Added error state
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
      amount: "1",
      // ✅ Updated default resolution to match new constants
      resolution: resolutionOptions[0].value, // "1024x1024"
    },
  });

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setError(null); // Clear previous errors
    setImages([]); // Clear previous images
    try {
      const response = await axios.post("/api/image", values);
      // ✅ Corrected: API returns an array of base64 data URLs directly
      setImages(response.data);
      form.reset();
    } catch (error: any) { // ✅ Added type :any
      console.error("[IMAGE_PAGE_ERROR]", error);
      // ✅ Added detailed error handling
      if (error.response && error.response.data && error.response.data.details) {
        setError(`Sorry, something went wrong: ${error.response.data.details}`);
      } else {
        setError("Sorry, something went wrong generating the image. Please try again.");
      }
    }
    // 'finally' block removed as router.refresh() was commented out
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
      <div className='px-4 lg:px-8'>
        <div>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='rounded-lg border w-full p-4 px-3 md:px-6 focus-within:shadow-sm grid grid-cols-12 gap-2'
            >
              <FormField
                name='prompt'
                render={({ field }) => (
                  <FormItem className='col-span-12 lg:col-span-6'>
                    <FormControl className='m-0 p-0'>
                      <Input
                        className="border-0 outline-none focus-visible:ring-0 focus-visible:ring-transparent"
                        disabled={isLoading} // ✅ Added disabled state
                        placeholder="Alpacas in the style of Picasso"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='amount'
                render={({ field }) => (
                  <FormItem className='col-span-12 lg:col-span-2'>
                    <Select
                      disabled={isLoading}
                      onValueChange={field.onChange}
                      value={field.value}
                      // ✅ Set default value correctly
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          {/* ✅ Ensure placeholder reflects default */}
                          <SelectValue placeholder={amountOptions.find(opt => opt.value === field.value)?.label} />
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
                name='resolution'
                render={({ field }) => (
                  <FormItem className='col-span-12 lg:col-span-2'>
                    <Select
                      disabled={isLoading}
                      onValueChange={field.onChange}
                      value={field.value}
                      // ✅ Set default value correctly
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                           {/* ✅ Ensure placeholder reflects default */}
                          <SelectValue placeholder={resolutionOptions.find(opt => opt.value === field.value)?.label} />
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
                disabled={isLoading}>
                Vend
              </Button>
            </form>
          </Form>
        </div>
      </div>

      <div className='space-y-4 mt-4 px-4 lg:px-8'> {/* ✅ Added padding */}
        {isLoading && (
          // ✅ Simplified loading state display
          <div className="p-8 rounded-lg w-full flex items-center justify-center bg-muted">
            <EmptyState label={'Genie is creating your masterpiece...'} />
          </div>
        )}
        {/* ✅ Display error message */}
        {error && <p className="text-red-500 text-center p-4">{error}</p>}
        {images.length === 0 && !isLoading && !error && (
          <EmptyState label="No images generated yet." />
        )}
        {images.length > 0 && (
          // ✅ Added grid container for proper layout
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-8">
            {images.map((src) => ( // Changed variable name to src for clarity
              <Card key={src.substring(0,50)} // Use part of base64 as key (not ideal but works)
                  className="rounded-lg overflow-hidden">
                <div className="relative aspect-square"> {/* Ensures square images */}
                  <img
                    src={src} // src is the base64 data URL
                    alt="Generated Image"
                    // ✅ Use fill and object-cover for better image display
                    className="object-cover"
                  />
                </div>
                {/* Optional: Add download button here if needed */}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePage;


