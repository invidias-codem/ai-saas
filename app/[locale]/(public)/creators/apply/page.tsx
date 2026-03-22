"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2 } from "lucide-react";

const applicationSchema = z.object({
  creatorName: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  tiktokHandle: z.string().optional(),
  instagramHandle: z.string().optional(),
  xHandle: z.string().optional(),
  primaryPlatform: z.string().min(1, "Please specify your primary platform."),
  audienceSize: z.string().min(1, "Please specify your audience size."),
  pitch: z.string().min(10, "Please tell us briefly why you'd be a good fit."),
});

type ApplicationFormValues = z.infer<typeof applicationSchema>;

export default function CreatorApplicationPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      creatorName: "",
      email: "",
      tiktokHandle: "",
      instagramHandle: "",
      xHandle: "",
      primaryPlatform: "",
      audienceSize: "",
      pitch: "",
    },
  });

  async function onSubmit(data: ApplicationFormValues) {
    setIsSubmitting(true);
    try {
      // For now, we simulate an API call. 
      // Later this will go to /api/referral/apply
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log("Application submitted:", data);
      setIsSuccess(true);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-500" />
            </div>
            <CardTitle className="text-2xl">Application Received</CardTitle>
            <CardDescription>
              We'll review your application and get back to you within 24-48 hours.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Button onClick={() => window.location.href = '/'}>Return Home</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4 bg-zinc-50 dark:bg-zinc-950 flex justify-center">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle className="text-3xl">Join the Tech Genie Creator Program</CardTitle>
          <CardDescription>
            Get paid per view, per signup, and per upgrade. No limits on what you can earn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="creatorName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name or Moniker</FormLabel>
                      <FormControl>
                        <Input placeholder="KJ Chen" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input placeholder="kj@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="tiktokHandle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>TikTok Handle</FormLabel>
                      <FormControl>
                        <Input placeholder="@handle" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="instagramHandle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instagram Handle</FormLabel>
                      <FormControl>
                        <Input placeholder="@handle" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="xHandle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>X / Twitter Handle</FormLabel>
                      <FormControl>
                        <Input placeholder="@handle" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="primaryPlatform"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Platform</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. TikTok, YouTube Shorts" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="audienceSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Audience Size</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 150k followers" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="pitch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Why are you a good fit for Tech Genie?</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Tell us a bit about your content style and audience..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting Application...
                  </>
                ) : (
                  "Submit Application"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}