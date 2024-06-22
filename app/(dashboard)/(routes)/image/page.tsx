"use client"

import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Heading } from "@/components/heading";
import {  ImageIcon } from "@radix-ui/react-icons";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import EmptyState from "@/components/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { amountOptions, resolutionOptions, formSchema } from "./constants";
import axios from "axios";

import dotenv from 'dotenv';



dotenv.config();

const ImagePage = () => {
  const router = useRouter();
  const [images, setImages] = useState<string[]>([]);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
      amount: "1", // Use default value as a number
      resolution: "512x512",
    },
  });
  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setImages([]); // Clear previous images before fetching new ones
      const response = await axios.post("/api/image", values);
      setImages(response.data.map((image: { url: string }) => image.url));
      form.reset();
    } catch (error) {
      console.error(error);
      // Handle errors and display user-friendly messages
    } finally {
      // Consider removing router.refresh() unless it's necessary
      // for specific behavior (e.g., clearing URL parameters)
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
                        className="border-0 outline-none"
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
                    <FormControl>
                      <Select
                        disabled={isLoading}
                        onValueChange={field.onChange}
                        value={field.value}
                        defaultValue={amountOptions[0].value}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={amountOptions[0].label} />
                        </SelectTrigger>
                        <SelectContent>
                          {amountOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </FormItem>
                )}

              />

                <FormField
                control={form.control}
                name='resolution'
                render={({ field }) => (
                  <FormItem className='col-span-12 lg:col-span-2'>
                    <FormControl>
                      <Select
                        disabled={isLoading}
                        onValueChange={field.onChange}
                        value={field.value}
                        defaultValue={resolutionOptions[0].value}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={resolutionOptions[0].label} />
                        </SelectTrigger>
                        <SelectContent>
                          {resolutionOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
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

      <div className='space-y-4 mt-4'>
      {isLoading && <EmptyState label={'Loading'} />} (
          <div className="p-20">
            
          </div>
        )
        {images.length === 0 && !isLoading && (
          <EmptyState label="No images found" />
        )}
        {images.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {images.map((image) => (
              <div
                key={image}
                className="w-full h-96 rounded-lg overflow-hidden"
              >
                <img
                  src={image}
                  alt="Generated Image"
                  className="w-full h-full object-cover"
                />  
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePage;


