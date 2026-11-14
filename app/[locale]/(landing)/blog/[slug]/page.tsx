import { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogHeader } from "@/components/blog/blog-header";
import { AuthorCard } from "@/components/blog/author-card";
import { TableOfContents, MobileTableOfContents } from "@/components/blog/table-of-contents";
import { RelatedPosts } from "@/components/blog/related-posts";
import { NewsletterCTA } from "@/components/blog/newsletter-cta";
import { mdxComponents } from "@/components/blog/mdx-components";
import {
  getAllPostSlugs,
  getPostBySlug,
  getRelatedPosts,
  extractTableOfContents
} from "@/lib/blog/mdx";
import { getSiteUrl } from "@/lib/site-url";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkUnwrapImages from "remark-unwrap-images";
import rehypeSlug from "rehype-slug";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;
export const revalidate = 3600;

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: "Post Not Found | Lattice OS Blog",
    };
  }

  const siteUrl = getSiteUrl();
  const url = `${siteUrl}/en/blog/${post.slug}`;

  return {
    title: `${post.title} | Lattice OS Blog`,
    description: post.description,
    authors: [{ name: post.author.name }],
    keywords: post.tags,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      authors: [post.author.name],
      tags: post.tags,
      url,
      images: [
        {
          url: post.ogImage,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [post.ogImage],
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedPosts(slug, 3);
  const tableOfContents = extractTableOfContents(post.content);
  const siteUrl = getSiteUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    image: post.ogImage,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    author: {
      "@type": "Person",
      name: post.author.name,
    },
    publisher: {
      "@type": "Organization",
      name: "Lattice OS",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/lattice-logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${siteUrl}/en/blog/${post.slug}`,
    },
    keywords: post.tags.join(", "),
    inLanguage: "en",
    isPartOf: {
      "@type": "Blog",
      name: "Lattice OS Blog",
      url: `${siteUrl}/en/blog`,
    },
    about: {
      "@type": "Thing",
      name: "Deterministic AI Infrastructure",
    },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${siteUrl}/en`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${siteUrl}/en/blog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: `${siteUrl}/en/blog/${post.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-8">
          <article className="min-w-0 max-w-3xl">
            <BlogHeader post={post} />
            <MobileTableOfContents items={tableOfContents} />

            <div className="min-w-0 break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkUnwrapImages]}
                rehypePlugins={[rehypeSlug]}
                components={mdxComponents}
              >
                {post.content}
              </ReactMarkdown>
            </div>

            <AuthorCard author={post.author} coAuthors={post.coAuthors} />

            <div className="mt-12">
              <NewsletterCTA variant="compact" />
            </div>
          </article>

          <aside className="hidden lg:block">
            <TableOfContents items={tableOfContents} />
          </aside>
        </div>

        <RelatedPosts posts={relatedPosts} />
      </main>
    </>
  );
}
