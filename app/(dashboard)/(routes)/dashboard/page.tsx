"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ArrowRightIcon, ChatBubbleIcon, CodeIcon, DiscIcon, ImageIcon, VideoIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";

const tools = [
  {
    label: "Conversation",
    icon: ChatBubbleIcon,
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    href: "/conversation",
    // Bento: Make the main chat feature prominent
    cols: "md:col-span-2",
  },
  {
    label: "Juke Box",
    icon: DiscIcon,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    href: "/music",
    cols: "md:col-span-1",
  },
  {
    label: "Quick Clip",
    icon: VideoIcon,
    href: "/video",
    color: "text-pink-700",
    bgColor: "bg-pink-700/10",
    cols: "md:col-span-1",
  },
  {
    label: "Image Capsule",
    icon: ImageIcon,
    href: "/image",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    cols: "md:col-span-1",
  },
  {
    label: "Code",
    icon: CodeIcon,
    href: "/code",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    cols: "md:col-span-1",
  },
];

const DashboardPage = () => {
  const router = useRouter();

  return (
    <div>
      <div className="mb-8 space-y-4">
        <h2 className="text-2xl md:text-4xl font-bold text-center">
          &rsquo;Unleash the power of Genie&rsquo;s Magic.&rsquo;
        </h2>
        <p className="text-muted-foreground font-light text-sm md:text-lg text-center max-w-2xl mx-auto">
          See How Genie Can Transform Your Business: All-in-one AI platform for Marketing, Sales, Customer Service & Data Analysis
        </p>
      </div>

      <div className="px-4 md:px-20 lg:px-32 space-y-4">
        {/* BENTO GRID LAYOUT */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <Card
              onClick={() => router.push(tool.href)}
              key={tool.href}
              className={cn(
                "p-4 border-black/5 flex flex-col justify-between hover:shadow-lg transition cursor-pointer group relative overflow-hidden",
                // Apply the bento column span logic here
                tool.cols,
                // Add a subtle height constraint for consistency
                "h-40 sm:h-48"
              )}
            >
              {/* Header: Icon and Arrow */}
              <div className="flex items-start justify-between w-full">
                <div className={cn("p-2 w-fit rounded-md transition-transform group-hover:scale-110", tool.bgColor)}>
                  <tool.icon className={cn("w-8 h-8", tool.color)} />
                </div>
                {/* Arrow reveals on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRightIcon className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>

              {/* Footer: Label */}
              <div>
                <div className="font-semibold text-lg">
                  {tool.label}
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                   Explore tool
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;

