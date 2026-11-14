"use client";

import { useSyncExternalStore } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTrigger,
    SheetTitle
} from "@/components/ui/sheet";
import SidebarClient from "@/components/SidebarClient";
import type { ConversationSeed } from "@/components/SidebarClient";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface MobileSidebarProps {
    initialConversations?: ConversationSeed[];
}

const MobileSidebar = ({ initialConversations = [] }: MobileSidebarProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    const isMounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

    useEffect(() => {
        // Close the sheet when the route changes — a navigation side-effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsOpen(false);
    }, [pathname]);

    if (!isMounted) {
        return null;
    }

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open workspace navigation">
                    <Menu className="h-5 w-5" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="max-w-72 border-border bg-chrome p-0 text-foreground">
                <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
                <SheetDescription className="sr-only">Navigate workspace tools and recent conversations.</SheetDescription>
                <SidebarClient onNavigate={() => setIsOpen(false)} initialConversations={initialConversations} />
            </SheetContent>
        </Sheet>
    );
};

export default MobileSidebar;
