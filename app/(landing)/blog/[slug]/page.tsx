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
  getPostBySlug,
  getAllPostSlugs,
  getRelatedPosts,
  extractTableOfContents
} from "@/lib/blog/mdx";
import { BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

// Generate static params for all blog posts
export async function generateStaticParams() {
  const slugs = getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

// Allow on-demand generation of blog posts not in the initial build
export const dynamicParams = true;

// Revalidate blog posts every 60 seconds for ISR
export const revalidate = 60;

// Generate metadata for each post
export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: "Post Not Found | Genie AI Blog",
    };
  }

  const url = `https://genieai.app/blog/${post.slug}`;

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

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedPosts(slug, 3);
  const tableOfContents = extractTableOfContents(post.content);

  // JSON-LD structured data
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
        url: "https://genieai.app/Genie.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://genieai.app/blog/${post.slug}`,
    },
  };

  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="bg-[#111827] min-h-screen flex flex-col overflow-x-hidden relative">
        {/* Background Gradients */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        </div>

        {/* Header */}
        <header className="relative z-10 py-4 px-4 sm:py-6 sm:px-6 md:px-10 flex justify-between items-center max-w-7xl mx-auto w-full">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative w-7 h-7 sm:w-8 sm:h-8">
              <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" />
            </div>
            <span className="text-xl sm:text-2xl font-bold text-white tracking-tight">Genie AI</span>
          </Link>
          <div className="flex items-center gap-x-1 sm:gap-x-2">
            <Link href="/blog">
              <Button variant="ghost" className="text-purple-400 hover:text-purple-300 hover:bg-white/10 rounded-full px-2 sm:px-4">
                <BookOpen className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Blog</span>
              </Button>
            </Link>
            <Link href="/dashboard" className="hidden sm:block">
              <Button variant="ghost" className="text-white hover:text-white hover:bg-white/10 rounded-full">
                Log in
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button className="bg-white text-black hover:bg-gray-200 rounded-full font-semibold text-sm sm:text-base px-3 sm:px-4">
                Get Started
              </Button>
            </Link>
          </div>
        </header>

        <main className="relative z-10 flex-grow">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
              {/* Main Content */}
              <article className="max-w-3xl">
                <BlogHeader post={post} />

                {/* Mobile TOC */}
                <MobileTableOfContents items={tableOfContents} />

                {/* MDX Content */}
                <div className="prose prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSlug]}
                  >
                    {post.content}
                  </ReactMarkdown>
                </div>

                {/* Author Card */}
                <AuthorCard author={post.author} coAuthors={post.coAuthors} />

                {/* Newsletter CTA */}
                <div className="mt-12">
                  <NewsletterCTA variant="compact" />
                </div>
              </article>

              {/* Sidebar - Desktop TOC */}
              <aside className="hidden lg:block">
                <TableOfContents items={tableOfContents} />
              </aside>
            </div>

            {/* Related Posts */}
            <RelatedPosts posts={relatedPosts} />
          </div>
        </main>

        {/* Footer */}
        <footer className="py-10 border-t border-white/10 bg-[#111827]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="relative w-6 h-6">
                  <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" />
                </div>
                <span className="text-lg font-bold text-white">Genie AI</span>
              </div>

              <div className="flex items-center gap-6 text-sm text-gray-400">
                <Link href="/blog" className="hover:text-white transition">Blog</Link>
                <Link href="/slack" className="hover:text-white transition">Slack Integration</Link>
                <Link href="/support" className="hover:text-white transition">Support</Link>
                <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-white/10 text-center">
              <p className="text-gray-500 text-sm">
                © {new Date().getFullYear()} Genie AI. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
