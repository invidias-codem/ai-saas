import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BlogCard } from "@/components/blog/blog-card";
import { NewsletterCTA } from "@/components/blog/newsletter-cta";
import { getAllPosts, getFeaturedPosts } from "@/lib/blog/mdx";
import { BLOG_CATEGORIES, BlogCategory } from "@/lib/blog/types";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

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
    <main className="min-w-0">
      {/* Hero Section */}
      <section className="pt-10 sm:pt-14 pb-10 px-4 text-center space-y-6 max-w-4xl mx-auto">
        <div className="inline-flex items-center rounded-full border border-border bg-accent px-4 py-2 text-sm text-accent-foreground">
          <Sparkles className="w-4 h-4 mr-2" />
          Memory-Native AI, Routing & Workflow Insights
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-foreground tracking-tight leading-[1.1]">
          The Lattice OS Blog
        </h1>

        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Explore memory-native AI, hybrid inference, model routing, and practical workflow design.
          Learn from the team building Lattice OS.
        </p>
      </section>

      {/* Category Filters */}
      <section className="px-4 pb-8 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/blog"
            aria-current={!activeCategory && !activeTag ? "page" : undefined}
            className={cn(
              "inline-flex items-center min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
              !activeCategory && !activeTag
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-chrome"
            )}
          >
            All Posts
          </Link>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/blog?category=${category.slug}`}
              aria-current={activeCategory === category.slug ? "page" : undefined}
              className={cn(
                "inline-flex items-center min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
                activeCategory === category.slug
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-chrome"
              )}
            >
              {category.name}
            </Link>
          ))}
        </div>

        {/* Series sub-nav */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          <span className="text-muted-foreground text-xs uppercase tracking-wider mr-2">Series:</span>
          {SERIES_LINKS.map((series) => (
            <Link
              key={series.slug}
              href={`/blog/series/${series.slug}`}
              className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors duration-200"
            >
              {series.name}
            </Link>
          ))}
        </div>

        {/* Active filter indicator */}
        {(activeCategory || activeTag) && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="text-muted-foreground text-sm">Showing:</span>
            {activeCategory && (activeCategory as BlogCategory) in BLOG_CATEGORIES && (
              <span className="rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground">
                {BLOG_CATEGORIES[activeCategory as BlogCategory].name}
              </span>
            )}
            {activeTag && (
              <span className="px-3 py-1 rounded-full text-sm bg-accent text-accent-foreground">
                #{activeTag}
              </span>
            )}
            <Link href="/blog" className="text-muted-foreground hover:text-foreground text-sm ml-2">
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
            <p className="text-muted-foreground text-lg mb-4">No posts found.</p>
            <Button asChild variant="outline">
              <Link href="/blog">
                View All Posts
              </Link>
            </Button>
          </div>
        )}
      </section>

      {/* Newsletter CTA */}
      <section className="px-4 pb-16 max-w-3xl mx-auto">
        <NewsletterCTA />
      </section>
    </main>
  );
}
