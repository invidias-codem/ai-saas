import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
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
import { BookOpen } from "lucide-react";
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

      <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative text-foreground">
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-3xl" />
        </div>

        <header className="relative z-10 py-4 px-4 sm:py-6 sm:px-6 md:px-10 flex justify-between items-center max-w-7xl mx-auto w-full">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative w-7 h-7 sm:w-8 sm:h-8">
              <Image src="/lattice-logo.png" alt="Lattice OS logo" fill className="object-cover" />
            </div>
            <span className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Lattice OS</span>
          </Link>
          <div className="flex items-center gap-x-1 sm:gap-x-2">
            <Link href="/blog">
              <Button variant="ghost" className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-slate-200/70 dark:hover:bg-white/10 rounded-full px-2 sm:px-4">
                <BookOpen className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Blog</span>
              </Button>
            </Link>
            <Link href="/dashboard" className="hidden sm:block">
              <Button variant="ghost" className="text-foreground hover:text-foreground hover:bg-slate-200/70 dark:hover:bg-white/10 rounded-full">
                Log in
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full font-semibold text-sm sm:text-base px-3 sm:px-4">
                Get Started
              </Button>
            </Link>
          </div>
        </header>

        <main className="relative z-10 flex-grow">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
              <article className="max-w-3xl">
                <BlogHeader post={post} />
                <MobileTableOfContents items={tableOfContents} />

                <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-24 prose-a:text-purple-600 dark:prose-a:text-purple-400">
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
          </div>
        </main>
      </div>
    </>
  );
}
