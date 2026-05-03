"use client";

import { UserButton } from "@clerk/nextjs";
import MobileSidebar from "./mobile-sidebar";
import { MemoryIndicator } from "./memory-indicator";
import { CreditDisplay } from "@/components/credit-display";
import LanguageSwitcher from "@/components/language-switcher";
import { useTranslations } from "next-intl";

const Navbar = () => {
    const t = useTranslations("Navbar");

    return (
        <div className="flex items-center p-4">
            <MobileSidebar />
            <div className="flex w-full items-center justify-end gap-x-2">
                <MemoryIndicator />
                <CreditDisplay />

                <div className="flex items-center gap-x-2">
                    <LanguageSwitcher />
                    <UserButton afterSignOutUrl="/" />
                </div>
            </div>
        </div>
    )
}

export default Navbar;
