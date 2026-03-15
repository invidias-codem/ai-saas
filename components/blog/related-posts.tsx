"use client";

import { BlogPost } from "@/lib/blog/types";
import { BlogCard } from "./blog-card";

interface RelatedPostsProps {
  posts: BlogPost[];
  title?: string;
}

export function RelatedPosts({ posts, title = "Related Articles" }: RelatedPostsProps) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="mt-16 pt-12 border-t border-white/10">
      <h2 className="text-2xl font-bold text-white mb-8">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}
