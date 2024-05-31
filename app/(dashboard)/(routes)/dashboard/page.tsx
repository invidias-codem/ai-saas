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
        bgColor: "bg-white-500\/10",
        href: "/conversation",
    },
    {
        label: "Juke Box",
        icon: DiscIcon,
        color: "text-orange-500",
        bgColor: "bg-white-500\/10",
        href: "/music",
    },
    {
        label: "Quick Clip",
        icon: VideoIcon,
        href: "/clip",
        color: "text-pink-700",
        bgColor: "bg-white-500\/10",
    },
    {
        label: "Image Capsule",
        icon: ImageIcon,
        href: "/image",
        color: "text-purple-500",
        bgColor: "bg-white-500\/10",
    },
    {
        label: "Code",
        icon: CodeIcon,
        href: "/code",
        color: "text-green-400",
        bgColor:"bg-white-500\/10",
    },
    
]

const DashboardPage = () => {
    const router = useRouter();

    return (
        <div>
            <div className="mb-8 space-y-4">
                <h2 className="text-2xl md:text-4xl font-bold text-center">
                    'Unleash the power of Genie's Magic.'
                </h2>
                <p className="text-muted-foreground font-light text-sm md:text-lg text-center">
                    See How Genie Can Transform Your Business:
                    All-in-one AI platform for Marketing, Sales, Customer Service & Data Analysis
                </p>
            </div>
            <div className="px-4 md:px-2- lg:px-32 space-y-4">
                {tools.map((tool) => (
                    <Card
                        onClick={() => router.push(tool.href)}
                        key={tool.href}
                        className="p-4 border-black/5 flex items-center justify-between hover:shadow-md transition cursor-pointer"
                        >
                            <div className="flex items-center gap-x-4">
                                <div className={cn("p-2 w-fit rounded-md", tool.bgColor)}>
                                    <tool.icon className={cn("w-8 h-8", tool.color)} />
                                </div>
                                <div className="font-semibold">
                                    {tool.label}
                                </div>
                            </div>
                            <ArrowRightIcon className="w-5 h-5"/>
                        </Card>
                ))}
            </div>
        </div>  
    )
}

export default DashboardPage;