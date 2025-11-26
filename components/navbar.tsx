import { Button } from "./ui/button"
import { UserButton } from "@clerk/nextjs";
import MobileSidebar from "./mobile-sidebar";
import { ModeToggle } from "./mode-toggle"; // Import the toggle
import { MemoryIndicator } from "./memory-indicator";

const Navbar = () => {
    return (
        <div className="flex items-center p-4">
            <Button variant={"ghost"} size={"icon"} className="md:hidden">
                <MobileSidebar />
            </Button>
            <div className="flex w-full justify-end items-center gap-x-2">
                {/* Memory Indicator */}
                <MemoryIndicator />
                {/* Add the Toggle here */}
                <ModeToggle />
                <UserButton afterSignOutUrl="/" />
            </div>
        </div>
    )
}

export default Navbar;