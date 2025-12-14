import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { BlogCard } from "@/components/blog/blog-card";
import { NewsletterCTA } from "@/components/blog/newsletter-cta";
import { getAllPosts, getFeaturedPosts } from "@/lib/blog/mdx";
import { BLOG_CATEGORIES, BlogCategory } from "@/lib/blog/types";
import { cn } from "@/lib/utils";
import { BookOpen, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog | Genie AI - AI Tips, Tutorials & Insights",
  description: "Learn how to harness the power of AI with tutorials, guides, and insights from the Genie AI team. Discover prompts, integrations, and productivity tips.",
  openGraph: {
    title: "Genie AI Blog - AI Tips, Tutorials & Insights",
    description: "Learn how to harness the power of AI with tutorials, guides, and insights from the Genie AI team.",
    type: "website",
    images: [
      {
        url: "/blog/og-image.png",
        width: 1200,
        height: 630,
        alt: "Genie AI Blog",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Genie AI Blog - AI Tips, Tutorials & Insights",
    description: "Learn how to harness the power of AI with tutorials, guides, and insights.",
    images: ["/blog/og-image.png"],
  },
};

interface BlogPageProps {
  searchParams: { category?: string; tag?: string };
}

export default function BlogPage({ searchParams }: BlogPageProps) {
  const allPosts = getAllPosts();
  const featuredPosts = getFeaturedPosts(1);
  const featuredPost = featuredPosts[0];
  
  // Filter posts based on search params
  let filteredPosts = allPosts;
  const activeCategory = searchParams.category as BlogCategory | undefined;
  const activeTag = searchParams.tag;

  if (activeCategory && BLOG_CATEGORIES[activeCategory]) {
    filteredPosts = allPosts.filter((post) => post.category === activeCategory);
  }

  if (activeTag) {
    filteredPosts = filteredPosts.filter((post) =>
      post.tags.map((t) => t.toLowerCase()).includes(activeTag.toLowerCase())
    );
  }

  // Remove featured post from regular list if showing all posts
  const regularPosts = !activeCategory && !activeTag && featuredPost
    ? filteredPosts.filter((post) => post.slug !== featuredPost.slug)
    : filteredPosts;

  const categories = Object.values(BLOG_CATEGORIES);

  return (
    <div className="bg-[#111827] min-h-screen flex flex-col overflow-x-hidden relative">
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 py-6 px-6 md:px-10 flex justify-between items-center max-w-7xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2">
          <div className="relative w-8 h-8">
            <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" />
          </div>
          <span className="text-2xl font-bold text-white tracking-tight">Genie AI</span>
        </Link>
        <div className="flex items-center gap-x-2">
          <Link href="/blog">
            <Button variant="ghost" className="text-purple-400 hover:text-purple-300 hover:bg-white/10 rounded-full">
              <BookOpen className="w-4 h-4 mr-2" />
              Blog
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button variant="ghost" className="text-white hover:text-white hover:bg-white/10 rounded-full">
              Log in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button className="bg-white text-black hover:bg-gray-200 rounded-full font-semibold">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-grow">
        {/* Hero Section */}
        <section className="pt-16 pb-12 px-4 text-center space-y-6 max-w-4xl mx-auto">
          <div className="inline-flex items-center rounded-full border border-purple-500/50 bg-purple-500/20 px-4 py-2 text-sm text-white backdrop-blur-xl">
            <Sparkles className="w-4 h-4 mr-2" />
            AI Tips, Tutorials & Insights
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
            The Genie AI Blog
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Discover AI prompts, tutorials, and insights to supercharge your productivity.
            Learn from the team building intelligent AI assistants.
          </p>
        </section>

        {/* Category Filters */}
        <section className="px-4 pb-8 max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/blog">
              <Button
                variant="ghost"
                className={cn(
                  "rounded-full",
                  !activeCategory && !activeTag
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                All Posts
              </Button>
            </Link>
            {categories.map((category) => (
              <Link key={category.slug} href={`/blog?category=${category.slug}`}>
                <Button
                  variant="ghost"
                  className={cn(
                    "rounded-full",
                    activeCategory === category.slug
                      ? cn(category.bgColor, category.color)
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {category.name}
                </Button>
              </Link>
            ))}
          </div>

          {/* Active filter indicator */}
          {(activeCategory || activeTag) && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="text-gray-500 text-sm">Showing:</span>
              {activeCategory && (
                <span className={cn(
                  "px-3 py-1 rounded-full text-sm",
                  BLOG_CATEGORIES[activeCategory].bgColor,
                  BLOG_CATEGORIES[activeCategory].color
                )}>
                  {BLOG_CATEGORIES[activeCategory].name}
                </span>
              )}
              {activeTag && (
                <span className="px-3 py-1 rounded-full text-sm bg-white/10 text-white">
                  #{activeTag}
                </span>
              )}
              <Link href="/blog" className="text-gray-400 hover:text-white text-sm ml-2">
                Clear
              </Link>
            </div>
          )}
        </section>

        {/* Featured Post */}
        {featuredPost && !activeCategory && !activeTag && (
          <section className="px-4 pb-12 max-w-7xl mx-auto">
            <BlogCard post={featuredPost} featured />
          </section>
        )}

        {/* Posts Grid */}
        <section className="px-4 pb-16 max-w-7xl mx-auto">
          {regularPosts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regularPosts.map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-gray-400 text-lg mb-4">No posts found.</p>
              <Link href="/blog">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                  View All Posts
                </Button>
              </Link>
            </div>
          )}
        </section>

        {/* Newsletter CTA */}
        <section className="px-4 pb-16 max-w-3xl mx-auto">
          <NewsletterCTA />
        </section>
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
  );
}
