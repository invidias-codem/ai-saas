"use client";

import { useRouter } from "next/navigation";
import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { CodeIcon, Wrench } from "lucide-react";

export default function CodePage() {
  const router = useRouter();

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 md:p-6 lg:p-8 text-center">
      <Heading
        title="Genie Code"
        description="Your AI pair programmer. Ask questions or attach code."
        icon={CodeIcon}
        iconColor="text-green-500"
        bgColor="bg-green-500/10"
      />
      <div className="mt-8 flex flex-col items-center gap-4">
        <Wrench className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Under Construction</h2>
        <p className="text-muted-foreground max-w-md">
          This feature is currently being improved. We&apos;re working hard to bring it back better than ever. Please check back later.
        </p>
        <Button onClick={() => router.push('/dashboard')}>
          Explore Other Tools
        </Button>
      </div>
    </div>
  );
}