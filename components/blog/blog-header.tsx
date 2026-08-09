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
    bgColor: 'bg-gray-500/10',
    color: 'text-gray-600 dark:text-gray-400'
  };

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/blog/${post.slug}`
      : `/blog/${post.slug}`;

  return (
    <header className="mb-10">
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Blog
      </Link>

      <div className="mb-4">
        <Link
          href={`/blog?category=${post.category}`}
          className={cn(
            "inline-flex px-3 py-1 rounded-full text-sm font-medium transition-colors",
            category.bgColor,
            category.color,
            "hover:opacity-80"
          )}
        >
          {category.name}
        </Link>
      </div>

      <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight mb-4 sm:mb-6">
        {post.title}
      </h1>

      <p className="text-base sm:text-lg md:text-xl text-slate-600 dark:text-gray-400 mb-6 sm:mb-8 leading-relaxed">
        {post.description}
      </p>

      <div className="flex flex-wrap items-center gap-3 sm:gap-6 pb-6 sm:pb-8 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gradient-to-tr from-purple-500 to-blue-500">
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
            <p className="text-slate-900 dark:text-white font-medium">{post.author.name}</p>
            <p className="text-slate-500 dark:text-gray-500 text-sm">{post.author.role}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-600 dark:text-gray-400">
          <Calendar className="w-4 h-4" />
          <span>{formatDate(post.publishedAt)}</span>
          {post.updatedAt && post.updatedAt !== post.publishedAt && (
            <span className="text-slate-500 dark:text-gray-500 text-sm">
              (Updated {formatDate(post.updatedAt)})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-slate-600 dark:text-gray-400">
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
              className="px-3 py-1 rounded-full text-xs bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
