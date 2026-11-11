import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'es', 'fr', 'de', 'th', 'vi'] as const;
export const defaultLocale = 'en';

export default getRequestConfig(async ({ locale }) => {
    const safeLocale = locale || defaultLocale;
    return {
        locale: safeLocale,
        messages: (await import(`./messages/${safeLocale}.json`)).default
    };
});
