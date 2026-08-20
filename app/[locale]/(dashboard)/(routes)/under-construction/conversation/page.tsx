"use client";

import { useRouter } from "next/navigation";
import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { ChatBubbleIcon } from "@radix-ui/react-icons";
import { Wrench } from "lucide-react";

export default function ConversationPage() {
  const router = useRouter();

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 md:p-6 lg:p-8 text-center">
      <Heading
        title="Conversation"
        description="Our most advanced conversation model."
        icon={ChatBubbleIcon}
        iconColor="text-violet-500"
        bgColor="bg-violet-500/10"
      />
      <div className="mt-6 sm:mt-8 flex flex-col items-center gap-4">
        <Wrench className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground" />
        <h2 className="text-xl sm:text-2xl font-semibold">Under Construction</h2>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-md px-4">
          This feature is currently being improved. We&apos;re working hard to bring it back better than ever. Please check back later.
        </p>
        <Button onClick={() => router.push('/dashboard')} className="mt-2">
          Explore Other Tools
        </Button>
      </div>
    </div>
  );
}
