import { MetadataRoute } from "next";
import { source } from "@/lib/source";
import { baseUrl } from "@/lib/utils";

export default function sitemap(): MetadataRoute.Sitemap {
    const languages = ["en", "zh-cn", "zh-tw"];

    const pages = source.getPages();
    const sitemap: MetadataRoute.Sitemap = [];

    // 添加根页面
    sitemap.push({
        url: baseUrl,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 1,
    });

    // 为每种语言添加页面
    languages.forEach((lang) => {
        // 添加语言首页
        sitemap.push({
            url: `${baseUrl}/${lang}`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.9,
        });

        // 添加所有文档页面
        pages.forEach((page) => {
            const slug = page.slugs.join("/");
            sitemap.push({
                url: `${baseUrl}/${lang}/${slug}`,
                lastModified: page.data.lastModified || new Date(),
                changeFrequency: "weekly",
                priority: 0.8,
            });
        });
    });

    return sitemap;
} 