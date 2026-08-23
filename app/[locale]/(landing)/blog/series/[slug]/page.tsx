import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { BlogCard } from "@/components/blog/blog-card";
import {
  getAllSeries,
  getPostsBySeries,
  getAllPosts,
  getFeaturedPosts,
} from "@/lib/blog/mdx";
import { cn } from "@/lib/utils";
import { BookOpen, Sparkles, ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

interface SeriesPageProps {
  params: Promise<{ slug: string }>;
}

const SERIES_NAMES: Record<string, string> = {
  "ucol": "UCOL: Unified Context Orchestration",
  "integrations": "Integrations: Slack & Workflow",
  "lattice-os": "Lattice OS: Platform & Brand",
};

function getSeriesName(slug: string): string {
  return SERIES_NAMES[slug] || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateStaticParams() {
  return getAllSeries().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: SeriesPageProps): Promise<Metadata> {
  const { slug } = await params;
  const seriesName = getSeriesName(slug);
  const posts = getPostsBySeries(slug);

  if (posts.length === 0) {
    return { title: `Series Not Found | Lattice OS Blog` };
  }

  const latestPost = posts[0];

  return {
    title: `${seriesName} | Lattice OS Blog`,
    description: latestPost.description,
    openGraph: {
      title: `${seriesName} — Lattice OS Blog`,
      description: latestPost.description,
      type: "website",
      images: [
        {
          url: latestPost.ogImage,
          width: 1200,
          height: 630,
          alt: seriesName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${seriesName} — Lattice OS Blog`,
      description: latestPost.description,
      images: [latestPost.ogImage],
    },
  };
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { slug } = await params;
  const posts = getPostsBySeries(slug);

  if (posts.length === 0) {
    notFound();
  }

  const seriesName = getSeriesName(slug);
  const featuredPosts = getFeaturedPosts(1);
  const featuredPost = featuredPosts[0];

  // Remove featured post from series list if it's in this series
  const seriesPosts = posts.filter((post) => post.slug !== featuredPost?.slug);

  return (
    <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative">
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
      </div>

      <main className="relative z-10 flex-grow">
        {/* Series Header */}
        <section className="pt-16 pb-12 px-4 text-center space-y-6 max-w-4xl mx-auto">
          <Link
            href="/blog"
            className="inline-flex items-center text-gray-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            All Posts
          </Link>

          <div className="inline-flex items-center rounded-full border border-purple-500/50 bg-purple-500/20 px-4 py-2 text-sm text-white backdrop-blur-xl">
            <Sparkles className="w-4 h-4 mr-2" />
            {seriesName}
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
            {seriesName}
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            {posts.length} {posts.length === 1 ? "article" : "articles"} in this series
          </p>
        </section>

        {/* Featured Post (if in this series) */}
        {featuredPost && featuredPost.series === slug && (
          <section className="px-4 pb-12 max-w-7xl mx-auto">
            <BlogCard post={featuredPost} featured />
          </section>
        )}

        {/* Series Posts Grid */}
        <section className="px-4 pb-16 max-w-7xl mx-auto">
          {seriesPosts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {seriesPosts.map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-gray-400 text-lg mb-4">No posts in this series yet.</p>
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
          <div className="text-center">
            <Link href="/blog">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                <BookOpen className="w-4 h-4 mr-2" />
                Back to Blog
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-10 border-t border-border bg-background">
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

          <div className="mt-8 pt-8 border-t border-border text-center">
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} Lattice OS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
