"use client";

import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetTitle
} from "@/components/ui/sheet";
import Sidebar from "@/components/sidebar";
import { ConversationHistory } from "@/components/conversation-history";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

const MobileSidebar = () => {
    const [isMounted, setIsMounted] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Close sidebar when route changes
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    if (!isMounted) {
        return null;
    }

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 bg-white dark:bg-[#111827] text-slate-900 dark:text-white">
                <SheetTitle className="hidden">Navigation Menu</SheetTitle>
                <div className="h-full flex flex-col">
                    <Sidebar onNavigate={() => setIsOpen(false)} />
                </div>
            </SheetContent>
        </Sheet>
    );
}

export default MobileSidebar;
