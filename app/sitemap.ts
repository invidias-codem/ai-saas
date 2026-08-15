import { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = getSiteUrl();
    const locales = ['en', 'th', 'vi', 'es', 'fr', 'de'];
    const routes = ['', '/dashboard', '/blog', '/pricing', '/support', '/checkout'];

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
