"use client";

import Image from "next/image";
import Link from "next/link";
import { BlogPost, BLOG_CATEGORIES } from "@/lib/blog/types";
import { formatDate } from "@/lib/blog/utils";
import { Clock, Calendar, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShareButton } from "@/components/share-button";

interface BlogHeaderProps {
  post: BlogPost;
}

export function BlogHeader({ post }: BlogHeaderProps) {
  const category = BLOG_CATEGORIES[post.category] ?? {
    name: 'General',
  };

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/blog/${post.slug}`
      : `/blog/${post.slug}`;

  return (
    <header className="mb-10">
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Blog
      </Link>

      <div className="mb-4">
        <Link
          href={`/blog?category=${post.category}`}
          className={cn(
            "inline-flex px-3 py-1 rounded-full text-sm font-medium transition-colors",
            "bg-accent text-accent-foreground",
            "hover:underline"
          )}
        >
          {category.name}
        </Link>
      </div>

      <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-foreground tracking-tight leading-tight mb-4 sm:mb-6">
        {post.title}
      </h1>

      <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-6 sm:mb-8 leading-relaxed">
        {post.description}
      </p>

      <div className="flex flex-wrap items-center gap-3 sm:gap-6 pb-6 sm:pb-8 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-accent">
            {post.author.avatar && (
              <Image
                src={post.author.avatar}
                alt={post.author.name}
                fill
                className="object-cover"
              />
            )}
          </div>
          <div>
            <p className="text-foreground font-medium">{post.author.name}</p>
            <p className="text-muted-foreground text-sm">{post.author.role}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>{formatDate(post.publishedAt)}</span>
          {post.updatedAt && post.updatedAt !== post.publishedAt && (
            <span className="text-muted-foreground text-sm">
              (Updated {formatDate(post.updatedAt)})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>{post.readingTime} min read</span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <ShareButton
            content={{
              title: post.title,
              text: post.description,
              url: shareUrl,
            }}
            variant="ghost"
            size="default"
          />
        </div>
      </div>

      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-6">
          {post.tags.map((tag) => (
            <Link
              key={tag}
              href={`/blog?tag=${encodeURIComponent(tag)}`}
              className="px-3 py-1 rounded-full text-xs bg-chrome text-muted-foreground hover:bg-accent hover:text-primary transition-colors"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
