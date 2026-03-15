"use client";

import { Montserrat } from "next/font/google";
import {  ChatBubbleIcon, CodeIcon, DashboardIcon, DiscIcon, GearIcon, ImageIcon, VideoIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

const montserrat = Montserrat({weight: "600", subsets: ["latin"]});

const routes = [
    {
        label: "Dashboard",
        icon: DashboardIcon,
        href: "/dashboard",
        color: "text-yellow-400",
    },
    {
        label: "Conversations",
        icon: ChatBubbleIcon,
        href: "/conversation",
        color: "text-sky-500",
    },
    {
        label: "Image Capsule",
        icon: ImageIcon,
        href: "/image",
        color: "text-purple-500",
    },
    {
        label: "Quick Clip",
        icon: VideoIcon,
        href: "/video",
        color: "text-pink-700",
    },
    {
        label: "Juke Box",
        icon: DiscIcon,
        href: "/music",
        color: "text-orange-500",
    },
    {
        label: "Code",
        icon: CodeIcon,
        href: "/code",
        color: "text-green-400",
    },
    {
        label: "Settings",
        icon: GearIcon,
        href: "/settings",
        color: "text-highlighter-500",
    },
];
    


const Sidebar = () => {
    const pathname = usePathname();
    return (
        <div className="space-y-4 py-4 flex flex-col h-full bg-[#111827] text-white">
            <div className="px-3 py-2 flex-1">
                <Link href={"/dashboard"} className="flex items-center pl-3 mb-14">
                
                    <div className="relative w-20 h-20 mr-10">
                        <Image
                            fill
                            alt="Logo"
                            src="/genie.png"
                        />
                    </div>
                    <h1 className={cn ("text-2xl font-bold", montserrat.className)}>
                        Genie
                    </h1>
                </Link>
                <div className="space-y-1">
  {routes.map((route) => (
    <Link
      href={route.href}
      key={route.href}
      className={cn("text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
        pathname === route.href ? "text-white bg-white/10" : "text-zinc-400"
      )}
    >
      <div className="flex items-center flex-1">
        <route.icon className={cn("h-5 w-5 mr-3", route.color)} />   
        {route.label}     
      </div>
    </Link>
  ))}
</div>

            </div>
        </div>
    );
}

export default Sidebar;