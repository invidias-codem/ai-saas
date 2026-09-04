import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BlogCard } from "@/components/blog/blog-card";
import { NewsletterCTA } from "@/components/blog/newsletter-cta";
import { getAllPosts, getFeaturedPosts, getAllSeries } from "@/lib/blog/mdx";
import { BLOG_CATEGORIES, BlogCategory } from "@/lib/blog/types";
import { cn } from "@/lib/utils";
import { BookOpen, Sparkles } from "lucide-react";

const SERIES_DISPLAY: Record<string, string> = {
  "ucol": "UCOL",
  "integrations": "Integrations",
  "lattice-os": "Lattice OS",
};

const SERIES_LINKS = Object.entries(SERIES_DISPLAY).map(([slug, name]) => ({
  slug,
  name,
}));

export const metadata: Metadata = {
  title: "Blog | Lattice OS — Deterministic AI Infrastructure, Multi-Model Routing & Sovereign Telemetry",
  description: "Technical deep dives on deterministic multi-model AI orchestration, UCOL routing, sovereign telemetry, Chameleon Consultant architecture, and memory-native infrastructure.",
  keywords: [
    "deterministic AI",
    "UCOL",
    "multi-model routing",
    "sovereign AI",
    "telemetry",
    "data refinery",
    "persona architecture",
    "Chameleon Consultant",
    "Weaver Code",
    "memory-native AI",
    "agentic workflows",
    "LLM orchestration",
    "context firewall",
    "post-generation critic",
    "Delta Engine",
    "World Model",
    "Lattice OS"
  ],
  openGraph: {
    title: "Lattice OS Blog — Deterministic AI Infrastructure, Multi-Model Routing & Sovereign Telemetry",
    description: "Technical deep dives on deterministic multi-model AI orchestration, UCOL routing, sovereign telemetry, Chameleon Consultant architecture, and memory-native infrastructure.",
    type: "website",
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        type: 'image/jpeg',
        alt: 'Lattice OS Blog',
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lattice OS Blog — Deterministic AI Infrastructure, Multi-Model Routing & Sovereign Telemetry",
    description: "Technical deep dives on deterministic multi-model AI orchestration, UCOL routing, sovereign telemetry, Chameleon Consultant architecture, and memory-native infrastructure.",
    images: ['/og-image.jpg'],
  },
};

// Revalidate blog index every 60 seconds for ISR
export const revalidate = 60;

interface BlogPageProps {
  searchParams: Promise<{ category?: string; tag?: string }>;
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
  const { category: activeCategory, tag: activeTag } = await searchParams;
  const allPosts = getAllPosts();
  const featuredPosts = getFeaturedPosts(1);
  const featuredPost = featuredPosts[0];

  // Filter posts based on search params
  let filteredPosts = allPosts;

  if (activeCategory && BLOG_CATEGORIES[activeCategory as BlogCategory]) {
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
    <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative">
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
            <Link
              href="/blog"
              className={cn(
                "inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
                !activeCategory && !activeTag
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              All Posts
            </Link>
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/blog?category=${category.slug}`}
                className={cn(
                  "inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
                  activeCategory === category.slug
                    ? cn(category.bgColor, category.color)
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                {category.name}
              </Link>
            ))}
          </div>

          {/* Series sub-nav */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <span className="text-gray-500 text-xs uppercase tracking-wider mr-2">Series:</span>
            {SERIES_LINKS.map((series) => (
              <Link
                key={series.slug}
                href={`/blog/series/${series.slug}`}
                className="inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300 hover:text-white hover:border-purple-500/30 transition-colors duration-200"
              >
                {series.name}
              </Link>
            ))}
          </div>

          {/* Active filter indicator */}
          {(activeCategory || activeTag) && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="text-gray-500 text-sm">Showing:</span>
              {activeCategory && (activeCategory as BlogCategory) in BLOG_CATEGORIES && (
                <span className={cn(
                  "px-3 py-1 rounded-full text-sm",
                  BLOG_CATEGORIES[activeCategory as BlogCategory].bgColor,
                  BLOG_CATEGORIES[activeCategory as BlogCategory].color
                )}>
                  {BLOG_CATEGORIES[activeCategory as BlogCategory].name}
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
    </div>
  );
}
