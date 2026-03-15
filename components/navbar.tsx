"use client";

import { Button } from "./ui/button"
import { UserButton } from "@clerk/nextjs";
import MobileSidebar from "./mobile-sidebar";
import { ModeToggle } from "./mode-toggle"; // Import the toggle
import { MemoryIndicator } from "./memory-indicator";
import { CreditDisplay } from "@/components/credit-display";
import LanguageSwitcher from "@/components/language-switcher";
import { useTranslations } from "next-intl";

const Navbar = () => {
    const t = useTranslations("Navbar");

    return (
        <div className="flex items-center p-4">
            <MobileSidebar />
            <div className="flex w-full justify-end items-center gap-x-2">
                {/* Memory Indicator */}
                <MemoryIndicator />
                {/* Credit Display */}
                <CreditDisplay />

                <div className="flex items-center gap-x-2">


                    {/* Language Switcher */}
                    <LanguageSwitcher />

                    {/* Theme Toggle */}
                    <ModeToggle />

                    <UserButton afterSignOutUrl="/" />
                </div>
            </div>
        </div>
    )
}

export default Navbar;