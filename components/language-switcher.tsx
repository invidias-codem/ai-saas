"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function LanguageSwitcher() {
    const t = useTranslations("Navbar");
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();

    const onSelectChange = (value: string) => {
        const nextLocale = value;
        startTransition(() => {
            const segments = pathname.split('/');
            segments[1] = nextLocale;
            const newPath = segments.join('/');
            
            // Set the cookie for next-intl so the server remembers it immediately
            document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000;SameSite=Lax`;
            
            router.replace(newPath);
            router.refresh();
        });
    };

    return (
        <Select value={locale} onValueChange={onSelectChange} disabled={isPending}>
            <SelectTrigger className="w-[80px]">
                <SelectValue placeholder="Lang" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="en">🇺🇸 EN</SelectItem>
                <SelectItem value="th">🇹🇭 TH</SelectItem>
                <SelectItem value="vi">🇻🇳 VI</SelectItem>
                <SelectItem value="es">🇪🇸 ES</SelectItem>
                <SelectItem value="fr">🇫🇷 FR</SelectItem>
                <SelectItem value="de">🇩🇪 DE</SelectItem>
            </SelectContent>
        </Select>
    );
}
