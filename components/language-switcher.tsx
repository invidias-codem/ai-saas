"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { ChangeEvent, useTransition } from "react";
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
            // Replace the locale in the pathname
            // Current pathname: /en/some-path
            // New pathname: /th/some-path
            // Note: This simple replacement assumes the pathname always starts with the locale
            // next-intl might handle this differently with its own Link/Router
            // But for switching, a full reload or router.replace is common

            // Using next-intl routing strategy is better if available, but for now manual replace:
            const segments = pathname.split('/');
            segments[1] = nextLocale;
            const newPath = segments.join('/');
            router.replace(newPath);
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
            </SelectContent>
        </Select>
    );
}
