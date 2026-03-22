import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = 'https://genie-ai.com'; // Replace with actual domain
    const locales = ['en', 'th', 'vi', 'es', 'fr', 'de'];
    const routes = ['', '/dashboard', '/blog', '/pricing', '/support'];

    const sitemap: MetadataRoute.Sitemap = [];

    for (const locale of locales) {
        for (const route of routes) {
            sitemap.push({
                url: `${baseUrl}/${locale}${route}`,
                lastModified: new Date(),
                changeFrequency: 'daily',
                priority: route === '' ? 1 : 0.8,
                alternates: {
                    languages: {
                        en: `${baseUrl}/en${route}`,
                        th: `${baseUrl}/th${route}`,
                        vi: `${baseUrl}/vi${route}`,
                        es: `${baseUrl}/es${route}`,
                        fr: `${baseUrl}/fr${route}`,
                        de: `${baseUrl}/de${route}`,
                    }
                }
            });
        }
    }

    return sitemap;
}
