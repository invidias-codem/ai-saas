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
  params: { slug: string };
}

export function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;
export const revalidate = 3600;

export function generateMetadata({ params }: BlogPostPageProps): Metadata {
  const post = getPostBySlug(params.slug);

  if (!post) {
    return {
      title: "Post Not Found | Genie AI Blog",
    };
  }

  const siteUrl = getSiteUrl();
  const url = `${siteUrl}/en/blog/${post.slug}`;

  return {
    title: `${post.title} | Genie AI Blog`,
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

export default function BlogPostPage({ params }: BlogPostPageProps) {
  const post = getPostBySlug(params.slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedPosts(params.slug, 3);
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
      name: "Genie AI",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/Genie.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${siteUrl}/en/blog/${post.slug}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="bg-[#FAF9F7] dark:bg-[#111827] min-h-screen flex flex-col overflow-x-hidden relative text-slate-900 dark:text-white">
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-3xl" />
        </div>

        <header className="relative z-10 py-4 px-4 sm:py-6 sm:px-6 md:px-10 flex justify-between items-center max-w-7xl mx-auto w-full">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative w-7 h-7 sm:w-8 sm:h-8">
              <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" />
            </div>
            <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Genie AI</span>
          </Link>
          <div className="flex items-center gap-x-1 sm:gap-x-2">
            <Link href="/blog">
              <Button variant="ghost" className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-slate-200/70 dark:hover:bg-white/10 rounded-full px-2 sm:px-4">
                <BookOpen className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Blog</span>
              </Button>
            </Link>
            <Link href="/dashboard" className="hidden sm:block">
              <Button variant="ghost" className="text-slate-700 dark:text-white hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 rounded-full">
                Log in
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button className="bg-slate-900 text-white dark:bg-white dark:text-black hover:bg-slate-800 dark:hover:bg-gray-200 rounded-full font-semibold text-sm sm:text-base px-3 sm:px-4">
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

        <footer className="py-10 border-t border-slate-200 dark:border-white/10 bg-[#FAF9F7] dark:bg-[#111827]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="relative w-6 h-6">
                  <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" />
                </div>
                <span className="text-lg font-bold text-slate-900 dark:text-white">Genie AI</span>
              </div>

              <div className="flex items-center gap-6 text-sm text-slate-500 dark:text-gray-400">
                <Link href="/blog" className="hover:text-slate-900 dark:hover:text-white transition">Blog</Link>
                <Link href="/slack" className="hover:text-slate-900 dark:hover:text-white transition">Slack Integration</Link>
                <Link href="/support" className="hover:text-slate-900 dark:hover:text-white transition">Support</Link>
                <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-white transition">Privacy Policy</Link>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-200 dark:border-white/10 text-center">
              <p className="text-slate-500 text-sm dark:text-gray-500">
                © {new Date().getFullYear()} Genie AI. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
