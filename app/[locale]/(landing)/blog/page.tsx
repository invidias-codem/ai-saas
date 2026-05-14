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
  title: "Blog | Lattice OS - Memory-Native AI, Routing & Workflow Insights",
  description: "Explore memory-native AI, model routing, hybrid inference, and workflow design from the team building Lattice OS.",
  openGraph: {
    title: "Lattice OS Blog - Memory-Native AI, Routing & Workflow Insights",
    description: "Explore memory-native AI, model routing, hybrid inference, and workflow design from the team building Lattice OS.",
    type: "website",
    images: [
      {
        url: "/blog/og-image.png",
        width: 1200,
        height: 630,
        alt: "Lattice OS Blog",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lattice OS Blog - Memory-Native AI, Routing & Workflow Insights",
    description: "Explore memory-native AI, model routing, hybrid inference, and workflow design.",
    images: ["/blog/og-image.png"],
  },
};

// Revalidate blog index every 60 seconds for ISR
export const revalidate = 60;

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
    <div className="bg-[#FAF9F7] dark:bg-[#111827] min-h-screen flex flex-col overflow-x-hidden relative">
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      {/* Header Removed - Using Global Navbar */}

      <main className="relative z-10 flex-grow">
        {/* Hero Section */}
        <section className="pt-16 pb-12 px-4 text-center space-y-6 max-w-4xl mx-auto">
          <div className="inline-flex items-center rounded-full border border-purple-500/50 bg-purple-500/20 px-4 py-2 text-sm text-white backdrop-blur-xl">
            <Sparkles className="w-4 h-4 mr-2" />
            Memory-Native AI, Routing & Workflow Insights
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
            The Lattice OS Blog
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Explore memory-native AI, hybrid inference, model routing, and practical workflow design.
            Learn from the team building Lattice OS.
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
              {activeCategory && BLOG_CATEGORIES[activeCategory] && (
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
      <footer className="py-10 border-t border-slate-200 dark:border-white/10 bg-[#FAF9F7] dark:bg-[#111827]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="relative w-6 h-6">
                <Image src="/Genie.png" alt="Lattice OS logo" fill className="object-cover" />
              </div>
              <span className="text-lg font-bold text-white">Lattice OS</span>
            </div>

            <div className="flex items-center gap-6 text-sm text-gray-400">
              <Link href="/blog" className="hover:text-white transition">Blog</Link>
              <Link href="/slack" className="hover:text-white transition">Slack Integration</Link>
              <Link href="/support" className="hover:text-white transition">Support</Link>
              <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-200 dark:border-white/10 text-center">
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} Lattice OS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
