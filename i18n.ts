import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'th', 'vi', 'es', 'fr', 'de'];

export default getRequestConfig(async ({ requestLocale }) => {
    // This corresponds to the `[locale]` segment
    let locale = await requestLocale;

    if (!locale || !locales.includes(locale as any)) {
        locale = 'en';
    }

    return {
        locale,
        messages: (await import(`./messages/${locale}.json`)).default
    };
});
