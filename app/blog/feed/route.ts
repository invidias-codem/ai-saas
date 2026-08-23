import { Metadata } from "next";
import { getAllPosts, getFeaturedPosts } from "@/lib/blog/mdx";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-static";

export async function GET() {
  const siteUrl = getSiteUrl();
  const posts = getAllPosts();
  const featuredPost = getFeaturedPosts(1)[0];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Lattice OS Blog</title>
    <link>${siteUrl}/blog</link>
    <description>Memory-native AI, routing, and workflow insights from the team building Lattice OS.</description>
    <language>en</language>
    <atom:link href="${siteUrl}/blog/feed" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${featuredPost ? `
    <item>
      <title><![CDATA[${featuredPost.title}]]></title>
      <link>${siteUrl}/blog/${featuredPost.slug}</link>
      <guid isPermaLink="true">${siteUrl}/blog/${featuredPost.slug}</guid>
      <description><![CDATA[${featuredPost.description}]]></description>
      <pubDate>${new Date(featuredPost.publishedAt).toUTCString()}</pubDate>
      <author>${featuredPost.author.name}</author>
    </item>
    ` : ""}
    ${posts.map((post) => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${siteUrl}/blog/${post.slug}</link>
      <guid isPermaLink="true">${siteUrl}/blog/${post.slug}</guid>
      <description><![CDATA[${post.description}]]></description>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
      <author>${post.author.name}</author>
    </item>
    `).join("")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
