"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BlogPost, BLOG_CATEGORIES } from "@/lib/blog/types";
import { formatDate } from "@/lib/blog/utils";
import { Clock, Calendar, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlogCardProps {
  post: BlogPost;
  featured?: boolean;
}

// Placeholder component for missing images
function ImagePlaceholder({ title, category }: { title: string; category: string }) {
  const categoryInfo = BLOG_CATEGORIES[category as keyof typeof BLOG_CATEGORIES];
  return (
    <div className={cn(
      "absolute inset-0 flex flex-col items-center justify-center",
      "bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-blue-500/20"
    )}>
      <Sparkles className={cn("w-12 h-12 mb-3", categoryInfo?.color || "text-purple-400")} />
      <p className="text-white/60 text-sm font-medium text-center px-4 line-clamp-2">
        {title}
      </p>
    </div>
  );
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
  const [imageError, setImageError] = useState(false);
  const category = BLOG_CATEGORIES[post.category] || BLOG_CATEGORIES['industry-insights'];

  if (featured) {
    return (
      <Link href={`/blog/${post.slug}`} className="group block">
        <article className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-300">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Image */}
            <div className="relative aspect-video md:aspect-auto md:h-full">
              {imageError ? (
                <ImagePlaceholder title={post.title} category={post.category} />
              ) : (
                <Image
                  src={post.ogImage}
                  alt={post.title}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  onError={() => setImageError(true)}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent md:bg-gradient-to-r" />
            </div>

            {/* Content */}
            <div className="p-6 md:p-8 flex flex-col justify-center">
              {/* Category Badge */}
              <div className="flex items-center gap-3 mb-4">
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium",
                  category.bgColor,
                  category.color
                )}>
                  {category.name}
                </span>
                <span className="text-yellow-400 text-xs font-medium">★ Featured</span>
              </div>

              {/* Title */}
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 group-hover:text-purple-400 transition-colors line-clamp-2">
                {post.title}
              </h2>

              {/* Description */}
              <p className="text-gray-400 mb-4 line-clamp-2">
                {post.description}
              </p>

              {/* Meta */}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <div className="relative w-6 h-6 rounded-full overflow-hidden bg-gradient-to-tr from-purple-500 to-blue-500" />
                  <span className="text-gray-400">{post.author.name}</span>
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
    <Link href={`/blog/${post.slug}`} className="group block h-full">
      <article className="h-full flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-300">
        {/* Image */}
        <div className="relative aspect-video overflow-hidden">
          {imageError ? (
            <ImagePlaceholder title={post.title} category={post.category} />
          ) : (
            <Image
              src={post.ogImage}
              alt={post.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              onError={() => setImageError(true)}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

          {/* Category Badge */}
          <div className="absolute top-4 left-4 z-10">
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm",
              category.bgColor,
              category.color
            )}>
              {category.name}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 flex flex-col">
          {/* Title */}
          <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-purple-400 transition-colors line-clamp-2">
            {post.title}
          </h3>

          {/* Description */}
          <p className="text-gray-400 text-sm mb-4 line-clamp-2 flex-1">
            {post.description}
          </p>

          {/* Meta */}
          <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t border-white/5">
            <div className="flex items-center gap-2">
              <div className="relative w-5 h-5 rounded-full overflow-hidden bg-gradient-to-tr from-purple-500 to-blue-500" />
              <span className="text-gray-400">{post.author.name}</span>
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
    <div className="h-full flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 animate-pulse">
      <div className="aspect-video bg-white/10" />
      <div className="flex-1 p-5 flex flex-col">
        <div className="h-6 bg-white/10 rounded mb-2" />
        <div className="h-4 bg-white/10 rounded w-3/4 mb-4" />
        <div className="flex-1" />
        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <div className="h-4 bg-white/10 rounded w-24" />
          <div className="h-4 bg-white/10 rounded w-20" />
        </div>
      </div>
    </div>
  );
}
