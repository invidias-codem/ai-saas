"use client";

import { Button } from "./ui/button"
import { UserButton } from "@clerk/nextjs";
import MobileSidebar from "./mobile-sidebar";
import { ModeToggle } from "./mode-toggle"; // Import the toggle
import { MemoryIndicator } from "./memory-indicator";
import { useProModal } from "@/hooks/use-pro-modal";

const Navbar = () => {
    const proModal = useProModal();
    return (
        <div className="flex items-center p-4">
            <MobileSidebar />
            <div className="flex w-full justify-end items-center gap-x-2">
                {/* Memory Indicator */}
                <MemoryIndicator />
                {/* Support Button */}
                <Button
                    onClick={proModal.onOpen}
                    variant="premium"
                    size="sm"
                    className="hidden md:flex bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-0"
                >
                    Support Genie <span className="ml-2">♥</span>
                </Button>
                {/* Add the Toggle here */}
                <ModeToggle />
                <UserButton afterSignOutUrl="/" />
            </div>
        </div>
    )
}

export default Navbar;