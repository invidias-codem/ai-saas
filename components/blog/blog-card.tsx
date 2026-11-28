"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BlogPost, BLOG_CATEGORIES } from "@/lib/blog/types";
import { formatDate } from "@/lib/blog/utils";
import { Clock, Calendar, Sparkles } from "lucide-react";

interface BlogCardProps {
  post: BlogPost;
  featured?: boolean;
}

function ImagePlaceholder({ title }: { title: string }) {
  return (
    <div className="absolute inset-0 grid place-content-center bg-chrome p-4 text-center">
      <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden="true" />
      <p className="line-clamp-2 text-sm font-medium text-muted-foreground">{title}</p>
    </div>
  );
}

function sanitizeSlug(slug: string): string {
  return slug.replace(/[^a-z0-9-]/gi, '').toLowerCase();
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
  const [imageError, setImageError] = useState(false);
  const category = BLOG_CATEGORIES[post.category] || BLOG_CATEGORIES['industry-insights'];

  if (featured) {
    return (
      <Link href={`/blog/${sanitizeSlug(post.slug)}`} className="group block rounded-2xl">
        <article className="relative overflow-hidden rounded-2xl border border-border bg-card hover:border-primary transition duration-200 shadow-sm dark:shadow-none">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="relative aspect-video md:aspect-auto md:h-full">
              {imageError ? (
                <ImagePlaceholder title={post.title} />
              ) : (
                <Image
                  src={post.cardImage ?? post.ogImage}
                  alt={post.title}
                  fill
                  className="object-cover transition-transform duration-200 motion-safe:group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  onError={() => setImageError(true)}
                />
              )}
            </div>

            <div className="p-6 md:p-8 flex flex-col justify-center">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground">
                  {category.name}
                </span>
                <span className="text-copper-text text-xs font-medium">★ Featured</span>
              </div>

              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors line-clamp-2">
                {post.title}
              </h2>

              <p className="text-muted-foreground mb-4 line-clamp-2">
                {post.description}
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="relative w-6 h-6 rounded-full overflow-hidden bg-accent" />
                  <span className="text-muted-foreground">{post.author.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(post.publishedAt)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{post.readingTime} min read</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link href={`/blog/${sanitizeSlug(post.slug)}`} className="group block h-full rounded-2xl">
      <article className="h-full flex flex-col overflow-hidden rounded-2xl border border-border bg-card hover:border-primary transition duration-200 shadow-sm dark:shadow-none">
        <div className="relative aspect-video overflow-hidden">
          {imageError ? (
            <ImagePlaceholder title={post.title} />
          ) : (
            <Image
              src={post.cardImage ?? post.ogImage}
              alt={post.title}
              fill
              className="object-cover transition-transform duration-200 motion-safe:group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              onError={() => setImageError(true)}
            />
          )}

          <div className="absolute top-4 left-4 z-10">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground">
              {category.name}
            </span>
          </div>
        </div>

        <div className="flex-1 p-5 flex flex-col">
          <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2">
            {post.title}
          </h3>

          <p className="text-muted-foreground text-sm mb-4 line-clamp-2 flex-1">
            {post.description}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="relative w-5 h-5 rounded-full overflow-hidden bg-accent" />
              <span className="text-muted-foreground">{post.author.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span>{formatDate(post.publishedAt)}</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {post.readingTime} min
              </span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

export function BlogCardSkeleton() {
  return (
    <div className="h-full flex flex-col overflow-hidden rounded-2xl border border-border bg-card motion-safe:animate-pulse shadow-sm dark:shadow-none">
      <div className="aspect-video bg-accent" />
      <div className="flex-1 p-5 flex flex-col">
        <div className="h-6 bg-accent rounded mb-2" />
        <div className="h-4 bg-accent rounded w-3/4 mb-4" />
        <div className="flex-1" />
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="h-4 bg-accent rounded w-24" />
          <div className="h-4 bg-accent rounded w-20" />
        </div>
      </div>
    </div>
  );
}
